/**
 * Issue #782: Test moderation webhook idempotency and signature safety
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ModerationWebhookController } from './moderation-webhook.controller';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { ModerationRepositoryService } from './moderation-repository.service';
import { ModerationStatus } from './ai-moderation.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('ModerationWebhookController - Idempotency and Signature Safety', () => {
  let controller: ModerationWebhookController;
  let confessionRepo: Repository<AnonymousConfession>;
  let moderationRepoService: ModerationRepositoryService;
  let configService: ConfigService;

  const mockWebhookSecret = 'test-webhook-secret';

  const mockPayload = {
    confessionId: 'confession-123',
    moderationScore: 0.85,
    moderationFlags: ['spam'],
    moderationStatus: ModerationStatus.FLAGGED,
    details: { spam: 0.85 },
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'WEBHOOK_SECRET') return mockWebhookSecret;
              return defaultValue;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            manager: {
              transaction: jest.fn(),
            },
          },
        },
        {
          provide: ModerationRepositoryService,
          useValue: {
            syncWebhookResult: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ModerationWebhookController>(ModerationWebhookController);
    confessionRepo = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );
    moderationRepoService = module.get<ModerationRepositoryService>(
      ModerationRepositoryService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Signature Validation', () => {
    it('should reject requests with missing signature', async () => {
      await expect(
        controller.handleModerationResults(mockPayload, ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject requests with invalid signature', async () => {
      const invalidSignature = 'invalid-signature-hash';

      await expect(
        controller.handleModerationResults(mockPayload, invalidSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept requests with valid signature', async () => {
      const serializedPayload = JSON.stringify(mockPayload);
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(serializedPayload)
        .digest('hex');

      const mockConfession = {
        id: mockPayload.confessionId,
        message: 'Test confession',
      };

      jest.spyOn(confessionRepo.manager, 'transaction').mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(mockConfession),
            save: jest.fn().mockResolvedValue(mockConfession),
          }),
        };
        return cb(manager);
      });

      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: false,
      });

      const result = await controller.handleModerationResults(mockPayload, validSignature);

      expect(result.success).toBe(true);
      expect(result.isIdempotent).toBe(false);
    });
  });

  describe('Payload Validation', () => {
    it('should reject malformed payloads missing required fields', async () => {
      const malformedPayload = {
        // Missing confessionId and moderationStatus
        moderationScore: 0.5,
      } as any;

      const serializedPayload = JSON.stringify(malformedPayload);
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(serializedPayload)
        .digest('hex');

      await expect(
        controller.handleModerationResults(malformedPayload, validSignature),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Idempotency', () => {
    it('should return idempotent response for duplicate webhook deliveries', async () => {
      const serializedPayload = JSON.stringify(mockPayload);
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(serializedPayload)
        .digest('hex');

      const mockConfession = {
        id: mockPayload.confessionId,
        message: 'Test confession',
      };

      jest.spyOn(confessionRepo.manager, 'transaction').mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(mockConfession),
            save: jest.fn().mockResolvedValue(mockConfession),
          }),
        };
        return cb(manager);
      });

      // First call - not idempotent
      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValueOnce({
        log: {} as any,
        isIdempotent: false,
      });

      const result1 = await controller.handleModerationResults(mockPayload, validSignature);
      expect(result1.isIdempotent).toBe(false);

      // Second call with same payload - should be idempotent
      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValueOnce({
        log: {} as any,
        isIdempotent: true,
      });

      const result2 = await controller.handleModerationResults(mockPayload, validSignature);
      expect(result2.isIdempotent).toBe(true);
    });

    it('should not create duplicate moderation logs for replayed webhooks', async () => {
      const serializedPayload = JSON.stringify(mockPayload);
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(serializedPayload)
        .digest('hex');

      const mockConfession = {
        id: mockPayload.confessionId,
        message: 'Test confession',
      };

      jest.spyOn(confessionRepo.manager, 'transaction').mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(mockConfession),
            save: jest.fn().mockResolvedValue(mockConfession),
          }),
        };
        return cb(manager);
      });

      const syncSpy = jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: true,
      });

      await controller.handleModerationResults(mockPayload, validSignature);

      // Verify syncWebhookResult was called with signature validation metadata
      expect(syncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureValid: true,
          payloadMalformed: false,
        }),
        expect.anything(),
      );
    });
  });

  describe('Confession Not Found', () => {
    it('should handle missing confession gracefully', async () => {
      const serializedPayload = JSON.stringify(mockPayload);
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(serializedPayload)
        .digest('hex');

      jest.spyOn(confessionRepo.manager, 'transaction').mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(null),
          }),
        };
        return cb(manager);
      });

      const result = await controller.handleModerationResults(mockPayload, validSignature);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Confession not found');
    });
  });
});
