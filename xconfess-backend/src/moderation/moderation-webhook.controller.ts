import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import {
  ModerationCategory,
  ModerationResult,
  ModerationStatus,
} from './ai-moderation.service';
import { ModerationRepositoryService } from './moderation-repository.service';

interface WebhookPayload {
  confessionId: string;
  moderationScore: number;
  moderationFlags: string[];
  moderationStatus: ModerationStatus;
  details: Record<string, number>;
  timestamp: string;
}

@Controller('webhooks/moderation')
export class ModerationWebhookController {
  private readonly logger = new Logger(ModerationWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepo: Repository<AnonymousConfession>,
    private readonly moderationRepoService: ModerationRepositoryService,
  ) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET', '');
  }

  @Post('results')
  @HttpCode(HttpStatus.OK)
  async handleModerationResults(
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-signature') signature: string,
  ) {
    // Issue #782: Enhanced signature validation and malformed payload handling
    const serializedPayload = JSON.stringify(payload);

    // Validate signature first
    if (!signature) {
      this.logger.warn('Missing moderation webhook signature');
      throw new UnauthorizedException('Missing signature');
    }

    if (!this.verifySignature(serializedPayload, signature)) {
      this.logger.warn('Invalid moderation webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    // Validate payload structure
    if (!payload.confessionId || !payload.moderationStatus) {
      this.logger.error('Malformed moderation webhook payload', { payload });
      throw new BadRequestException('Malformed payload: missing required fields');
    }

    const requiresReview =
      payload.moderationStatus === ModerationStatus.FLAGGED;
    const shouldHide = payload.moderationStatus === ModerationStatus.REJECTED;
    const moderationResult: ModerationResult = {
      score: payload.moderationScore,
      flags: payload.moderationFlags as ModerationCategory[],
      status: payload.moderationStatus,
      details: payload.details,
      requiresReview,
    };
    const deliveryHash = this.buildDeliveryHash(serializedPayload);

    const result = await this.confessionRepo.manager.transaction(
      async (manager) => {
        const confessionRepo = manager.getRepository(AnonymousConfession);
        const confession = await confessionRepo.findOne({
          where: { id: payload.confessionId },
        });

        if (!confession) {
          return { status: 'not_found' as const };
        }

        // Issue #782: Idempotent webhook processing with delivery hash
        const { isIdempotent } =
          await this.moderationRepoService.syncWebhookResult(
            {
              confessionId: confession.id,
              content: confession.message,
              result: moderationResult,
              deliveryHash,
              deliveryTimestamp: payload.timestamp,
              signatureValid: true,
              payloadMalformed: false,
            },
            manager,
          );

        if (isIdempotent) {
          return { status: 'idempotent' as const, confessionId: confession.id };
        }

        confession.moderationScore = payload.moderationScore;
        confession.moderationFlags = payload.moderationFlags;
        confession.moderationStatus = payload.moderationStatus;
        confession.moderationDetails = payload.details;
        confession.requiresReview = requiresReview;
        confession.isHidden = shouldHide;

        await confessionRepo.save(confession);

        return { status: 'processed' as const, confessionId: confession.id };
      },
    );

    if (result.status === 'not_found') {
      this.logger.error(`Confession ${payload.confessionId} not found`);
      return { success: false, error: 'Confession not found' };
    }

    if (result.status === 'idempotent') {
      this.logger.log(
        `Ignoring duplicate moderation webhook for confession ${payload.confessionId}`,
      );

      return {
        success: true,
        confessionId: result.confessionId,
        status: payload.moderationStatus,
        isIdempotent: true,
      };
    }

    if (payload.moderationStatus === ModerationStatus.REJECTED) {
      this.eventEmitter.emit('moderation.high-severity', {
        confessionId: result.confessionId,
        score: payload.moderationScore,
        flags: payload.moderationFlags,
      });
    }

    if (payload.moderationStatus === ModerationStatus.FLAGGED) {
      this.eventEmitter.emit('moderation.requires-review', {
        confessionId: result.confessionId,
        score: payload.moderationScore,
        flags: payload.moderationFlags,
      });
    }

    this.logger.log(
      `Processed moderation webhook for confession ${payload.confessionId}`,
    );

    return {
      success: true,
      confessionId: result.confessionId,
      status: payload.moderationStatus,
      isIdempotent: false,
    };
  }

  private buildDeliveryHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }
}
