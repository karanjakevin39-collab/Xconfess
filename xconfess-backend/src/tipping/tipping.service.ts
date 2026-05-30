import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { VerifyTipDto } from './dto/verify-tip.dto';
import * as crypto from 'crypto';

export interface TipStats {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
}

export interface TipVerificationResult {
  tip: Tip;
  isNew: boolean;
  isIdempotent: boolean;
  conflictDetails?: {
    reason: 'DIFFERENT_CONFESSION' | 'ALREADY_PROCESSING' | 'ALREADY_VERIFIED';
    originalConfessionId?: string;
    requestId?: string;
  };
}

interface SettlementReceiptMetadata {
  settlementId: string | null;
  proofMetadata: string | null;
  anonymousSender: boolean;
}

interface ProcessedTransactionData {
  amount: number;
  senderAddress: string | null;
  receiptMetadata: SettlementReceiptMetadata;
}

@Injectable()
export class TippingService {
  private static readonly MAX_RECEIPT_PROOF_METADATA_LEN = 128;
  private static readonly LOCK_TIMEOUT_MS = 30000; // 30 seconds
  private readonly logger = new Logger(TippingService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Generate idempotency key for a tip verification request
   * Issue #170: Idempotency key based on confessionId + txHash
   * Format: SHA256(confessionId:txHash)
   */
  private generateIdempotencyKey(confessionId: string, txHash: string): string {
    const keyMaterial = `${confessionId}:${txHash}`;
    return crypto.createHash('sha256').update(keyMaterial).digest('hex');
  }

  /**
   * Check if a tip with matching idempotency already exists
   * Issue #170: Enforce replay safety with canonical responses
   */
  private async findTipByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<Tip | null> {
    return this.tipRepository.findOne({
      where: { idempotencyKey },
    });
  }

  private extractSettlementReceiptMetadata(
    txData: any,
  ): SettlementReceiptMetadata {
    const empty: SettlementReceiptMetadata = {
      settlementId: null,
      proofMetadata: null,
      anonymousSender: false,
    };

    const memoType = txData?.memo_type;
    const memoValue = txData?.memo;
    if (
      memoType !== 'text' ||
      typeof memoValue !== 'string' ||
      memoValue.length === 0
    ) {
      return empty;
    }

    try {
      const payload = JSON.parse(memoValue);
      const settlementId =
        typeof payload?.settlement_id === 'string' &&
        payload.settlement_id.length > 0
          ? payload.settlement_id
          : null;
      const proofMetadata =
        typeof payload?.proof_metadata === 'string' &&
        payload.proof_metadata.length > 0
          ? payload.proof_metadata
          : null;

      if (
        proofMetadata &&
        proofMetadata.length > TippingService.MAX_RECEIPT_PROOF_METADATA_LEN
      ) {
        throw new BadRequestException(
          'Settlement receipt proof metadata exceeds allowed bounds',
        );
      }

      return {
        settlementId,
        proofMetadata,
        anonymousSender: payload?.anonymous_sender === true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Non-JSON or non-receipt memo should not invalidate otherwise valid payments.
      return empty;
    }
  }

  /**
   * Acquire a processing lock for a tip to prevent concurrent verify/reconciliation races
   * Issue #784: Preserve single-credit semantics
   */
  private async acquireProcessingLock(
    txId: string,
    processType: 'verify' | 'reconciliation',
  ): Promise<{ success: boolean; existingTip?: Tip }> {
    const lockId = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    return await this.tipRepository.manager.transaction(async (manager) => {
      const tipRepo = manager.getRepository(Tip);

      // Check if tip already exists
      const existingTip = await tipRepo.findOne({
        where: { txId },
      });

      if (existingTip) {
        // Tip already processed - return it for idempotent response
        if (existingTip.verificationStatus === TipVerificationStatus.VERIFIED) {
          return { success: false, existingTip };
        }

        // Check if there's an active lock
        if (existingTip.processingLock) {
          const lockAge = now.getTime() - (existingTip.lockedAt?.getTime() || 0);
          
          // If lock is stale (older than timeout), we can steal it
          if (lockAge < TippingService.LOCK_TIMEOUT_MS) {
            this.logger.warn(
              `Tip ${txId} is already being processed by ${existingTip.lockedBy}`,
            );
            return { success: false, existingTip };
          }

          this.logger.warn(
            `Stealing stale lock on tip ${txId} from ${existingTip.lockedBy}`,
          );
        }

        // Acquire or update lock
        await tipRepo.update(existingTip.id, {
          processingLock: lockId,
          lockedAt: now,
          lockedBy: processType,
          retryCount: existingTip.retryCount + 1,
          lastCheckedAt: now,
        });

        return { success: true };
      }

      // Create new pending tip with lock
      const newTip = tipRepo.create({
        txId,
        verificationStatus: TipVerificationStatus.PENDING,
        processingLock: lockId,
        lockedAt: now,
        lockedBy: processType,
        retryCount: 0,
        lastCheckedAt: now,
      });

      await tipRepo.save(newTip);
      return { success: true };
    });
  }

  /**
   * Release processing lock after completion
   */
  private async releaseProcessingLock(txId: string): Promise<void> {
    await this.tipRepository.update(
      { txId },
      {
        processingLock: null,
        lockedAt: null,
        lockedBy: null,
      },
    );
  }

  /**
   * Update retry metadata for debugging and reconciliation
   * Issue #777: Persist retry metadata
   */
  private async updateRetryMetadata(
    txId: string,
    chainStatus: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const now = new Date();
    await this.tipRepository
      .createQueryBuilder()
      .update(Tip)
      .set({
        lastChainStatus: chainStatus,
        lastCheckedAt: now,
        reconciliationMetadata: metadata || {},
      })
      .where('txId = :txId', { txId })
      .execute();
  }

  /**
   * Get all tips for a confession
   */
  async getTipsByConfessionId(confessionId: string): Promise<Tip[]> {
    return this.tipRepository.find({
      where: { confessionId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get tipping statistics for a confession
   */
  async getTipStats(confessionId: string): Promise<TipStats> {
    const tips = await this.tipRepository.find({
      where: { confessionId },
    });

    const totalAmount = tips.reduce((sum, tip) => sum + Number(tip.amount), 0);
    const totalCount = tips.length;
    const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    return {
      totalAmount,
      totalCount,
      averageAmount,
    };
  }

  /**
   * Verify a tip transaction on-chain and record it
   * Issue #170: Implements idempotent verification with replay-safe semantics
   * - Idempotency key: SHA256(confessionId:txHash)
   * - Duplicate requests: Return canonical response without double-crediting
   * - Conflict detection: Clear semantics for attempts that already settled
   * Issue #784: Uses locking to prevent double-crediting during concurrent verify/reconciliation
   * Issue #777: Updates retry metadata for debugging
   */
  async verifyAndRecordTip(
    confessionId: string,
    dto: VerifyTipDto,
  ): Promise<TipVerificationResult> {
    // Check if confession exists
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
    });

    if (!confession) {
      throw new NotFoundException(
        `Confession with ID ${confessionId} not found`,
      );
    }

    // Generate idempotency key for replay safety
    const idempotencyKey = this.generateIdempotencyKey(confessionId, dto.txId);

    // Check if this exact request (confessionId + txHash) was already processed
    const existingIdempotentTip = await this.findTipByIdempotencyKey(
      idempotencyKey,
    );

    if (existingIdempotentTip) {
      // This exact request already completed - return canonical response
      this.logger.debug(
        `Idempotent replay detected for tip ${dto.txId} on confession ${confessionId}`,
      );

      return {
        tip: existingIdempotentTip,
        isNew: false,
        isIdempotent: true,
      };
    }

    // Check if this txId was used for a different confession
    const tipByTxId = await this.tipRepository.findOne({
      where: { txId: dto.txId },
    });

    if (tipByTxId && tipByTxId.confessionId !== confessionId) {
      // Conflict: txId already used for a different confession
      this.logger.warn(
        `Conflict: txId ${dto.txId} attempted for confession ${confessionId} but already used for ${tipByTxId.confessionId}`,
      );

      throw new ConflictException({
        message: `Transaction ${dto.txId} was already used for a different confession`,
        conflictReason: 'DIFFERENT_CONFESSION',
        originalConfessionId: tipByTxId.confessionId,
        canRetry: false,
      });
    }

    // Acquire processing lock to prevent race conditions
    const lockResult = await this.acquireProcessingLock(dto.txId, 'verify');

    if (!lockResult.success && lockResult.existingTip) {
      // Another process is currently handling this tip for this confession
      throw new ConflictException({
        message: `Transaction ${dto.txId} is currently being processed. Please retry in a moment.`,
        conflictReason: 'ALREADY_PROCESSING',
        canRetry: true,
      });
    }

    if (!lockResult.success) {
      // This should not happen, but safeguard against it
      throw new ConflictException({
        message: `Transaction ${dto.txId} is currently being processed. Please retry in a moment.`,
        conflictReason: 'ALREADY_PROCESSING',
        canRetry: true,
      });
    }

    try {
      // Verify transaction on-chain
      const isValid = await this.stellarService.verifyTransaction(dto.txId);

      if (!isValid) {
        await this.updateRetryMetadata(dto.txId, 'not_found', {
          error: 'Transaction not found on chain',
          attemptedAt: new Date().toISOString(),
        });
        await this.releaseProcessingLock(dto.txId);
        throw new BadRequestException(
          'Transaction not found or invalid on Stellar network',
        );
      }

      // Fetch transaction details from Horizon to get amount and sender
      const txData = await this.fetchTransactionData(dto.txId);
      const processedData = await this.processTransactionData(txData, dto.txId);

      // Minimum tip amount check (0.1 XLM)
      const MIN_TIP_AMOUNT = 0.1;
      if (processedData.amount < MIN_TIP_AMOUNT) {
        await this.updateRetryMetadata(dto.txId, 'invalid_amount', {
          amount: processedData.amount,
          minRequired: MIN_TIP_AMOUNT,
        });
        await this.releaseProcessingLock(dto.txId);
        throw new BadRequestException(
          `Tip amount ${processedData.amount} XLM is below minimum of ${MIN_TIP_AMOUNT} XLM`,
        );
      }

      // Update or create tip with verified status
      const existingTip = await this.tipRepository.findOne({
        where: { txId: dto.txId },
      });

      let savedTip: Tip;

      if (existingTip) {
        // Update existing pending tip
        existingTip.confessionId = confessionId;
        existingTip.amount = processedData.amount;
        existingTip.senderAddress = processedData.senderAddress;
        existingTip.idempotencyKey = idempotencyKey;
        existingTip.verificationStatus = TipVerificationStatus.VERIFIED;
        existingTip.verifiedAt = new Date();
        existingTip.lastChainStatus = 'verified';
        existingTip.lastCheckedAt = new Date();
        existingTip.reconciliationMetadata = {
          verifiedBy: 'user_request',
          processedData: {
            amount: processedData.amount,
            senderAddress: processedData.senderAddress,
          },
          idempotencyKey: idempotencyKey,
        };
        savedTip = await this.tipRepository.save(existingTip);
      } else {
        // Create new tip
        const tip = this.tipRepository.create({
          confessionId,
          amount: processedData.amount,
          txId: dto.txId,
          idempotencyKey: idempotencyKey,
          senderAddress: processedData.senderAddress,
          verificationStatus: TipVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          lastChainStatus: 'verified',
          lastCheckedAt: new Date(),
          retryCount: 0,
          reconciliationMetadata: {
            verifiedBy: 'user_request',
            processedData: {
              amount: processedData.amount,
              senderAddress: processedData.senderAddress,
            },
            idempotencyKey: idempotencyKey,
          },
        });
        savedTip = await this.tipRepository.save(tip);
      }

      // Release lock after successful processing
      await this.releaseProcessingLock(dto.txId);

      return {
        tip: savedTip,
        isNew: !existingTip,
        isIdempotent: false,
      };
    } catch (error) {
      // Release lock on error
      await this.releaseProcessingLock(dto.txId);
      throw error;
    }
  }

  private async fetchTransactionData(txId: string): Promise<any> {
    const horizonUrl = this.stellarService.getHorizonTxUrl(txId);
    const response = await fetch(horizonUrl);

    if (!response.ok) {
      throw new BadRequestException('Failed to fetch transaction details');
    }

    return response.json();
  }

  private async processTransactionData(
    txData: any,
    txId: string,
  ): Promise<ProcessedTransactionData> {
    try {
      const operations = txData._embedded?.operations || [];
      const paymentOps = operations.filter(
        (op: any) => op.type === 'payment' && op.asset_type === 'native',
      );

      if (!paymentOps || paymentOps.length === 0) {
        throw new BadRequestException(
          'Transaction does not contain XLM payment',
        );
      }

      const paymentOp = paymentOps[0];
      const amount = parseFloat(paymentOp.amount);
      const receiptMetadata = this.extractSettlementReceiptMetadata(txData);
      const senderAddress = receiptMetadata.anonymousSender
        ? null
        : paymentOp.from || null;

      void receiptMetadata.settlementId;
      void receiptMetadata.proofMetadata;

      return {
        amount,
        senderAddress,
        receiptMetadata,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to process tip transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get tip by transaction ID
   */
  async getTipByTxId(txId: string): Promise<Tip | null> {
    return this.tipRepository.findOne({
      where: { txId },
      relations: ['confession'],
    });
  }
}
