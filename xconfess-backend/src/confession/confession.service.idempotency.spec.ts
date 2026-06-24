import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfessionService } from './confession.service';
import { AnonymousConfession } from './entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { AnchorConfessionDto } from '../stellar/dto/anchor-confession.dto';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AppLogger } from '../logger/logger.service';

// Mock encryption
jest.mock('../utils/confession-encryption', () => ({
  decryptConfession: jest.fn((msg: string) => msg),
  encryptConfession: jest.fn((msg: string) => msg),
}));

// Mock the repository
const mockConfessionRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  manager: { getRepository: jest.fn() },
};

describe('ConfessionService - Idempotency', () => {
  let service: ConfessionService;
  let confessionRepo: jest.Mocked<AnonymousConfessionRepository>;
  let stellarService: jest.Mocked<StellarService>;

  const mockConfession = {
    id: 'test-confession-id',
    message: 'encrypted-test-message',
    stellarTxHash: null,
    stellarHash: null,
    isAnchored: false,
    anchoredAt: null,
    isDeleted: false,
  };

  const mockExistingConfession = {
    id: 'existing-confession-id',
    message: 'encrypted-existing-message',
    gender: 'male',
    stellarTxHash: 'a'.repeat(64),
    stellarHash: 'hash123',
    isAnchored: true,
    anchoredAt: new Date(),
    isDeleted: false,
  };

  const mockAnchorDto: AnchorConfessionDto = {
    stellarTxHash: 'a'.repeat(64),
  };

  beforeEach(async () => {
    mockConfessionRepo.findOne.mockReset();
    mockConfessionRepo.update.mockReset();
    mockConfessionRepo.create.mockReset();
    mockConfessionRepo.save.mockReset();
    mockConfessionRepo.manager.getRepository.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        {
          provide: AnonymousConfessionRepository,
          useValue: mockConfessionRepo,
        },
        {
          provide: StellarService,
          useValue: {
            isValidTxHash: jest.fn().mockReturnValue(true),
            processAnchorData: jest.fn().mockReturnValue({
              stellarTxHash: 'a'.repeat(64),
              stellarHash: 'hash123',
              anchoredAt: new Date(),
            }),
            getExplorerUrl: jest.fn().mockReturnValue('https://stellar.explorer/tx/hash'),
            verifyTransaction: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-aes-key-32-chars-long!!') },
        },
        {
          provide: AppLogger,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: AnonymousUserService,
          useValue: { create: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn() },
        },
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn().mockResolvedValue({ score: 0, flags: [], status: 'approved', requiresReview: false, details: {} }) },
        },
        {
          provide: ConfessionViewCacheService,
          useValue: { invalidateCache: jest.fn() },
        },
        {
          provide: CacheService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        {
          provide: TagService,
          useValue: { validateTags: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ConfessionService>(ConfessionService);
    confessionRepo = module.get(AnonymousConfessionRepository);
    stellarService = module.get(StellarService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('anchorConfession - Idempotency', () => {
    it('✅ should allow first anchor request with new txHash', async () => {
      confessionRepo.findOne
        .mockResolvedValueOnce(mockConfession as any)
        .mockResolvedValueOnce({
          ...mockConfession,
          stellarTxHash: 'a'.repeat(64),
          stellarHash: 'hash123',
        } as any);
      
      confessionRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.anchorConfession('test-confession-id', mockAnchorDto);

      expect(result).toHaveProperty('anchorPending', true);
      expect(result).toHaveProperty('stellarTxHash', 'a'.repeat(64));
    });

    it('✅ should return existing pending anchor metadata on replay', async () => {
      confessionRepo.findOne.mockResolvedValueOnce({
        ...mockConfession,
        stellarTxHash: 'a'.repeat(64),
        isAnchored: false,
      } as any);

      const result = await service.anchorConfession('test-confession-id', mockAnchorDto);

      expect(result).toHaveProperty('anchorPending', true);
      expect(result).toHaveProperty('confessionId', 'test-confession-id');
      expect(result).toHaveProperty('isAnchored', false);
      expect(result).toHaveProperty('stellarTxHash', 'a'.repeat(64));
    });

    it('✅ should prevent duplicate txHash with ConflictException', async () => {
      confessionRepo.findOne
        .mockResolvedValueOnce(mockConfession as any)
        .mockResolvedValueOnce(null);

      confessionRepo.update.mockRejectedValue({
        code: '23505',
      });

      await expect(service.anchorConfession('test-confession-id', mockAnchorDto))
        .rejects
        .toThrow(ConflictException);
    });

    it('✅ should reject invalid txHash format', async () => {
      stellarService.isValidTxHash.mockReturnValueOnce(false);
      confessionRepo.findOne.mockResolvedValueOnce(mockConfession as any);

      await expect(service.anchorConfession('test-confession-id', { stellarTxHash: 'invalid' }))
        .rejects
        .toThrow(BadRequestException);
    });

    it('✅ should log replay detection events', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      confessionRepo.findOne.mockResolvedValueOnce({
        ...mockConfession,
        stellarTxHash: 'a'.repeat(64),
        isAnchored: false,
      } as any);

      await service.anchorConfession('test-confession-id', mockAnchorDto);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'anchor_replay',
          stellarTxHash: 'a'.repeat(64),
        }),
      );
    });
  });

  describe('create - idempotency', () => {
    it('returns existing confession for repeated create with same idempotency key and matching body', async () => {
      confessionRepo.findOne.mockResolvedValueOnce({ ...mockExistingConfession } as any);

      const result = await service.create({
        message: 'encrypted-existing-message',
        idempotencyKey: 'idem-key',
        gender: 'male',
        stellarTxHash: 'a'.repeat(64),
      } as any);

      expect(result).toEqual({ ...mockExistingConfession });
      expect(result.message).toBe(mockExistingConfession.message);
    });

    it('throws ConflictException when same idempotency key is reused with a different message', async () => {
      confessionRepo.findOne.mockResolvedValueOnce(mockExistingConfession as any);

      await expect(
        service.create({
          message: 'different message',
          idempotencyKey: 'idem-key',
          gender: 'male',
          stellarTxHash: 'a'.repeat(64),
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('returns existing confession when duplicate idempotency key is detected during save', async () => {
      confessionRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockExistingConfession } as any);
      confessionRepo.create.mockReturnValue(mockConfession as any);
      confessionRepo.save.mockRejectedValueOnce({ code: '23505' });

      const result = await service.create({
        message: 'encrypted-existing-message',
        idempotencyKey: 'idem-key',
        gender: 'male',
        stellarTxHash: 'a'.repeat(64),
      } as any);

      expect(result).toEqual({ ...mockExistingConfession });
      expect(confessionRepo.save).toHaveBeenCalled();
    });
  });
});
