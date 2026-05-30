import { NotificationProcessor, NOTIFICATION_DLQ, NOTIFICATION_QUEUE, NotificationJobData } from './notification.processor';
import { EmailNotificationService } from '../services/email-notification.service';
import { AppLogger } from '../../logger/logger.service';
import { Queue, Job } from 'bullmq';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let emailNotificationService: { sendEmail: jest.Mock };
  let dlqQueue: { add: jest.Mock };
  let appLogger: { incrementCounter: jest.Mock; observeTimer: jest.Mock };

  beforeEach(() => {
    emailNotificationService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    dlqQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    appLogger = {
      incrementCounter: jest.fn(),
      observeTimer: jest.fn(),
    };

    processor = new NotificationProcessor(
      emailNotificationService as unknown as EmailNotificationService,
      dlqQueue as unknown as Queue<NotificationJobData>,
      appLogger as unknown as AppLogger,
    );
  });

  it('should process notification jobs and emit processing metrics', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-123',
      attemptsMade: 0,
      data: { userId: 'user-1', type: 'test', title: 'Title', message: 'Message' },
      opts: {},
    } as unknown as Job<NotificationJobData>;

    await processor.process(job);

    expect(emailNotificationService.sendEmail).toHaveBeenCalledWith(job.data);
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_processing_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(appLogger.observeTimer).toHaveBeenCalledWith(
      'notification_queue_processing_duration_ms',
      expect.any(Number),
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
  });

  it('should count retries for non-exhausted failed jobs', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-456',
      attemptsMade: 1,
      data: { userId: 'user-2', type: 'test', title: 'Title', message: 'Message' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('transient failure'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_retry_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name, attempt: job.attemptsMade }),
    );
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('should move exhausted failed jobs to the dead-letter queue and count failures', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-789',
      attemptsMade: 3,
      data: { userId: 'user-3', type: 'test', title: 'Title', message: 'Message' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('terminal failure'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_failure_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_dlq_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(dlqQueue.add).toHaveBeenCalledWith(
      'dead-letter',
      expect.objectContaining({
        ...job.data,
        _meta: expect.objectContaining({ originalJobId: String(job.id), attemptsMade: job.attemptsMade, lastError: 'terminal failure' }),
      }),
      expect.objectContaining({ removeOnComplete: false, removeOnFail: false }),
    );
  });
});
