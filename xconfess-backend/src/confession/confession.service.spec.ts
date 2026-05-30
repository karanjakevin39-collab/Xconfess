import { Test, TestingModule } from '@nestjs/testing';
import { AnonymousConfession } from './entities/confession.entity';
import { ConfessionService } from './confession.service';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnonymousConfessionRepository } from './repository/confession.repository';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { SortOrder } from './dto/get-confessions.dto';
import { AiModerationService } from '../moderation/ai-moderation.service';
import { ModerationRepositoryService } from '../moderation/moderation-repository.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from 'src/logger/logger.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import { StellarService } from '../stellar/stellar.service';
import { CacheService } from '../cache/cache.service';
import { TagService } from './tag.service';
import { encryptConfession } from '../utils/confession-encryption';

describe('ConfessionService', () => {
  let service: ConfessionService;
  let repo: jest.Mocked<Repository<AnonymousConfession>>;
  let qb: Partial<SelectQueryBuilder<AnonymousConfession>> & any;
  let anonUserService: any;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: repo },
        {
          provide: ConfessionViewCacheService,
          useValue: { checkAndMarkView: jest.fn() },
        },
        {
          provide: AiModerationService,
          useValue: { moderateContent: jest.fn() },
        },
        {
          provide: ModerationRepositoryService,
          useValue: {
            createLog: jest.fn(),
            getLogsByConfession: jest.fn(),
            updateReview: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: AnonymousUserService,
          useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('12345678901234567890123456789012'),
          },
        },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: {
            anchorConfession: jest.fn(),
            processAnchorData: jest.fn(),
            getExplorerUrl: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: string[]) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        { provide: TagService, useValue: { validateTags: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConfessionService);
    anonUserService = module.get(AnonymousUserService);
  });

  it('remove() soft‑deletes existing', async () => {
    repo.findOne.mockResolvedValue({ id: '1', isDeleted: false } as any);
    await expect(service.remove('1')).resolves.toEqual({
      message: 'Confession soft-deleted',
      id: '1',
    });
    expect(repo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ isDeleted: true, deletedAt: expect.any(Date) }),
    );
  });

  it('remove() throws if not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
  });

  it('getConfessions paginates and filters', async () => {
    qb.getMany.mockResolvedValue([
      {
        id: 'a',
        message: encryptConfession('hello', '12345678901234567890123456789012'),
        created_at: new Date('2026-03-25T00:00:00.000Z'),
      },
    ]);

    const res = await service.getConfessions({
      page: 2,
      limit: 5,
      sort: SortOrder.NEWEST,
    });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(6); // fetchLimit = limit + 1
    expect(res.data).toHaveLength(1);
    expect(res.limit).toBe(5);
    expect(res.hasMore).toBe(false);
  });

  it('getUserConfessions minimal test', async () => {
    console.log('START TEST');
    anonUserService.getAnonIdsForUser.mockResolvedValue(['anon1']);
    qb.getMany.mockResolvedValue([]);

    try {
      const res = await service.getUserConfessions(1, { limit: 10 });
      console.log('RESULT', res);
      expect(res.data).toHaveLength(0);
    } catch (e) {
      console.error('ERROR', e);
      throw e;
    }
  });
});

describe('ConfessionService — anchor pending-state guard (#776)', () => {
  let service: ConfessionService;
  let confessionRepo: any;
  let stellarService: any;

  beforeEach(async () => {
    confessionRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    stellarService = {
      isValidTxHash: jest.fn().mockReturnValue(true),
      processAnchorData: jest.fn().mockReturnValue({
        stellarTxHash: 'a'.repeat(64),
        stellarHash: 'b'.repeat(64),
        anchoredAt: new Date(),
      }),
      getExplorerUrl: jest.fn().mockReturnValue('https://stellar.expert/testnet/tx/aaa'),
      verifyTransaction: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfessionService,
        { provide: AnonymousConfessionRepository, useValue: confessionRepo },
        { provide: ConfessionViewCacheService, useValue: { checkAndMarkView: jest.fn() } },
        { provide: AiModerationService, useValue: { moderateContent: jest.fn() } },
        {
          provide: ModerationRepositoryService,
          useValue: { createLog: jest.fn(), getLogsByConfession: jest.fn(), updateReview: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AnonymousUserService, useValue: { create: jest.fn(), getAnonIdsForUser: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('12345678901234567890123456789012') } },
        { provide: AppLogger, useValue: { log: jest.fn(), error: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: StellarService, useValue: stellarService },
        {
          provide: CacheService,
          useValue: {
            buildKey: jest.fn((...parts: string[]) => parts.join(':')),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            delPattern: jest.fn(),
          },
        },
        { provide: TagService, useValue: { validateTags: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConfessionService);
  });

  describe('anchorConfession', () => {
    it('returns pending-state response without new DB write when a prior anchor is still pending', async () => {
      const existingTx = 'c'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p1',
        message: encryptConfession('hello', '12345678901234567890123456789012'),
        isAnchored: false,
        stellarTxHash: existingTx,
        stellarHash: 'd'.repeat(64),
        isDeleted: false,
      });

      const result = await service.anchorConfession('conf-p1', { stellarTxHash: 'e'.repeat(64) });

      expect(result).toMatchObject({ anchorPending: true, isAnchored: false, stellarTxHash: existingTx });
      expect(confessionRepo.update).not.toHaveBeenCalled();
    });

    it('does not overwrite the pending tx hash with a new submission', async () => {
      const existingTx = 'f'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p2',
        message: encryptConfession('secret', '12345678901234567890123456789012'),
        isAnchored: false,
        stellarTxHash: existingTx,
        stellarHash: 'g'.repeat(64),
        isDeleted: false,
      });

      const result = await service.anchorConfession('conf-p2', { stellarTxHash: 'h'.repeat(64) });

      expect(result.stellarTxHash).toBe(existingTx);
    });

    it('throws BadRequestException when confession is already fully anchored', async () => {
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-p3',
        message: encryptConfession('test', '12345678901234567890123456789012'),
        isAnchored: true,
        stellarTxHash: 'i'.repeat(64),
        isDeleted: false,
      });

      await expect(
        service.anchorConfession('conf-p3', { stellarTxHash: 'j'.repeat(64) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records a new pending anchor and returns anchorPending:true when no anchor exists', async () => {
      confessionRepo.findOne
        .mockResolvedValueOnce({
          id: 'conf-p4',
          message: encryptConfession('my secret', '12345678901234567890123456789012'),
          isAnchored: false,
          stellarTxHash: null,
          isDeleted: false,
        })
        .mockResolvedValueOnce({
          id: 'conf-p4',
          message: encryptConfession('my secret', '12345678901234567890123456789012'),
          isAnchored: false,
          stellarTxHash: 'a'.repeat(64),
          stellarHash: 'b'.repeat(64),
        });

      const result = await service.anchorConfession('conf-p4', { stellarTxHash: 'a'.repeat(64) });

      expect(confessionRepo.update).toHaveBeenCalledWith(
        'conf-p4',
        expect.objectContaining({ stellarTxHash: 'a'.repeat(64) }),
      );
      expect(result.anchorPending).toBe(true);
    });
  });

  describe('verifyStellarAnchor', () => {
    it('promotes a pending anchor to confirmed when chain verification succeeds', async () => {
      const txHash = 'k'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v1',
        isAnchored: false,
        stellarTxHash: txHash,
        stellarHash: 'l'.repeat(64),
        anchoredAt: null,
        isDeleted: false,
      });
      stellarService.verifyTransaction.mockResolvedValue(true);

      const result = await service.verifyStellarAnchor('conf-v1');

      expect(result.isAnchored).toBe(true);
      expect(result.anchorPending).toBe(false);
      expect(confessionRepo.update).toHaveBeenCalledWith(
        'conf-v1',
        expect.objectContaining({ isAnchored: true }),
      );
    });

    it('keeps pending state when chain verification is not yet confirmed', async () => {
      const txHash = 'm'.repeat(64);
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v2',
        isAnchored: false,
        stellarTxHash: txHash,
        stellarHash: 'n'.repeat(64),
        anchoredAt: null,
        isDeleted: false,
      });
      stellarService.verifyTransaction.mockResolvedValue(false);

      const result = await service.verifyStellarAnchor('conf-v2');

      expect(result.isAnchored).toBe(false);
      expect(result.anchorPending).toBe(true);
      expect(confessionRepo.update).not.toHaveBeenCalled();
    });

    it('reports not-anchored and not-pending when no stellarTxHash exists', async () => {
      confessionRepo.findOne.mockResolvedValue({
        id: 'conf-v3',
        isAnchored: false,
        stellarTxHash: null,
        isDeleted: false,
      });

      const result = await service.verifyStellarAnchor('conf-v3');

      expect(result.isAnchored).toBe(false);
      expect(result.anchorPending).toBe(false);
    });
  });
});
