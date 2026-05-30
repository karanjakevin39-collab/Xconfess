import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

interface QueueDetail {
  status: 'up' | 'down';
  workers?: number;
  counts?: Record<string, number>;
  error?: string;
  hint?: string;
}

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(QueueHealthIndicator.name);

  constructor(
    @InjectQueue('notifications') private readonly notifications: Queue,
    @InjectQueue('notifications-dlq') private readonly dlq: Queue,
    @InjectQueue('export-queue') private readonly exportQueue: Queue,
    @InjectQueue('confession-draft-publisher')
    private readonly draftQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const jobsEnabled =
      this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';

    if (!jobsEnabled) {
      return this.getStatus(key, true, {
        mode: 'disabled',
        reason: 'ENABLE_BACKGROUND_JOBS is not set to "true" — queue workers are not expected.',
      });
    }

    const queues: Array<{
      name: string;
      queue: Queue;
      requiresWorkers: boolean;
    }> = [
      {
        name: 'notifications',
        queue: this.notifications,
        requiresWorkers: true,
      },
      // DLQ is a retention queue — no processor is expected to run against it.
      {
        name: 'notifications-dlq',
        queue: this.dlq,
        requiresWorkers: false,
      },
      {
        name: 'export-queue',
        queue: this.exportQueue,
        requiresWorkers: true,
      },
      {
        name: 'confession-draft-publisher',
        queue: this.draftQueue,
        requiresWorkers: true,
      },
    ];

    const details: Record<string, QueueDetail> = {};
    let allHealthy = true;

    await Promise.all(
      queues.map(async ({ name, queue, requiresWorkers }) => {
        try {
          const [counts, workers] = await Promise.all([
            queue.getJobCounts('active', 'waiting', 'failed', 'delayed'),
            queue.getWorkers(),
          ]);

          const workerCount = workers.length;
          const healthy = !requiresWorkers || workerCount > 0;

          if (!healthy) {
            allHealthy = false;
          }

          details[name] = {
            status: healthy ? 'up' : 'down',
            workers: workerCount,
            counts,
            ...(healthy
              ? {}
              : {
                  hint: `Queue "${name}" has no active workers. Ensure the processor service is running and ENABLE_BACKGROUND_JOBS=true is set.`,
                }),
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Queue health check failed for "${name}": ${message}`,
          );
          allHealthy = false;
          details[name] = {
            status: 'down',
            error: message,
            hint: `Could not connect to queue "${name}". Verify REDIS_HOST, REDIS_PORT, and that the Bull queue name matches the registered queue in health.module.ts.`,
          };
        }
      }),
    );

    if (!allHealthy) {
      // Surface per-queue breakdown so the contributor sees exactly which
      // queues are down without needing to read server logs.
      throw new HealthCheckError(
        'One or more queues are unhealthy',
        this.getStatus(key, false, details),
      );
    }

    return this.getStatus(key, true, details);
  }
}