import { UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModerationStatus } from './ai-moderation.service';
import { ModerationWebhookController } from './moderation-webhook.controller';

describe('ModerationWebhookController', () => {
  const webhookSecret = 'top-secret';
  let controller: ModerationWebhookController;
  let confessionRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: {
      transaction: jest.Mock;
    };
  };
  let moderationRepoService: {
    syncWebhookResult: jest.Mock;
  };
  let eventEmitter: {
    emit: jest.Mock;
  };

  const confession = {
    id: 'conf-123',
    message: 'example confession',
    moderationScore: 0,
    moderationFlags: [],
    moderationStatus: ModerationStatus.PENDING,
    moderationDetails: null,
    requiresReview: false,
    isHidden: false,
  } as any;

  const buildSignature = (payload: unknown) => {
    const crypto = require('crypto') as typeof import('crypto');
    return crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  };

  beforeEach(() => {
    const txFindOne = jest.fn().mockResolvedValue({ ...confession });
    const txSave = jest.fn().mockImplementation(async (value) => value);

    confessionRepo = {
      findOne: txFindOne,
      save: txSave,
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            getRepository: jest.fn().mockReturnValue({
              findOne: txFindOne,
              save: txSave,
            }),
          }),
        ),
      },
    };
    moderationRepoService = {
      syncWebhookResult: jest
        .fn()
        .mockResolvedValue({ log: { id: 'log-1' }, isIdempotent: false }),
    };
    eventEmitter = {
      emit: jest.fn(),
    };

    controller = new ModerationWebhookController(
      { get: jest.fn().mockReturnValue(webhookSecret) } as any,
      eventEmitter as unknown as EventEmitter2,
      confessionRepo as any,
      moderationRepoService as any,
    );
  });

  it('updates the confession and emits requires-review for flagged results', async () => {
    const payload = {
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: '2026-03-25T10:00:00.000Z',
    };

    const result = await controller.handleModerationResults(
      payload,
      buildSignature(payload),
    );

    expect(moderationRepoService.syncWebhookResult).toHaveBeenCalledWith(
      expect.objectContaining({
        confessionId: 'conf-123',
        deliveryTimestamp: payload.timestamp,
        result: expect.objectContaining({
          status: ModerationStatus.FLAGGED,
          requiresReview: true,
        }),
      }),
      expect.anything(),
    );
    expect(confessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        moderationStatus: ModerationStatus.FLAGGED,
        requiresReview: true,
        isHidden: false,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'moderation.requires-review',
      expect.objectContaining({
        confessionId: 'conf-123',
        score: payload.moderationScore,
      }),
    );
    expect(result).toEqual({
      success: true,
      confessionId: 'conf-123',
      status: ModerationStatus.FLAGGED,
      isIdempotent: false,
    });
  });

  it('emits high-severity for rejected results', async () => {
    const payload = {
      confessionId: 'conf-123',
      moderationScore: 0.99,
      moderationFlags: ['violence'],
      moderationStatus: ModerationStatus.REJECTED,
      details: { violence: 0.99 },
      timestamp: '2026-03-25T10:05:00.000Z',
    };

    await controller.handleModerationResults(payload, buildSignature(payload));

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'moderation.high-severity',
      expect.objectContaining({
        confessionId: 'conf-123',
        score: payload.moderationScore,
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'moderation.requires-review',
      expect.anything(),
    );
  });

  it('treats a duplicate delivery as idempotent and skips side effects', async () => {
    const payload = {
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: '2026-03-25T10:00:00.000Z',
    };
    moderationRepoService.syncWebhookResult.mockResolvedValueOnce({
      log: { id: 'log-1' },
      isIdempotent: true,
    });

    const result = await controller.handleModerationResults(
      payload,
      buildSignature(payload),
    );

    expect(confessionRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      confessionId: 'conf-123',
      status: ModerationStatus.FLAGGED,
      isIdempotent: true,
    });
  });

  it('rolls back staged webhook log updates when confession save fails', async () => {
    const payload = {
      confessionId: 'conf-123',
      moderationScore: 0.85,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.85 },
      timestamp: '2026-03-25T10:00:00.000Z',
    };

    const committed = {
      moderationLogs: 0,
      isHidden: confession.isHidden,
    };

    confessionRepo.manager.transaction.mockImplementationOnce(async (work) => {
      let stagedLogCount = committed.moderationLogs;
      const stagedConfession = { ...confession };
      const txRepo = {
        findOne: jest.fn().mockResolvedValue(stagedConfession),
        save: jest
          .fn()
          .mockRejectedValue(new Error('Injected failure after log write')),
      };

      moderationRepoService.syncWebhookResult.mockImplementationOnce(
        async () => {
          stagedLogCount += 1;
          return { log: { id: 'log-rollback' }, isIdempotent: false };
        },
      );

      const value = await work({
        getRepository: jest.fn().mockReturnValue(txRepo),
      });
      committed.moderationLogs = stagedLogCount;
      committed.isHidden = stagedConfession.isHidden;
      return value;
    });

    await expect(
      controller.handleModerationResults(payload, buildSignature(payload)),
    ).rejects.toThrow('Injected failure after log write');

    expect(committed.moderationLogs).toBe(0);
    expect(committed.isHidden).toBe(false);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects webhook requests with an invalid signature', async () => {
    const payload = {
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: '2026-03-25T10:00:00.000Z',
    };

    await expect(
      controller.handleModerationResults(payload, 'invalid-signature'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
