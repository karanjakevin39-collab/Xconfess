import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ExportRequest } from './entities/export-request.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface RetentionPolicyConfig {
  retentionDays: number;
  auditCleanupActions: boolean;
}

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);
  private readonly retentionDays: number;
  private readonly auditCleanupActions: boolean;

  constructor(
    @InjectRepository(ExportRequest) private repo: Repository<ExportRequest>,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.retentionDays = this.configService.get<number>(
      'export.retentionDays',
      7,
    );
    this.auditCleanupActions = this.configService.get<boolean>(
      'export.auditCleanupActions',
      true,
    );
  }

  private getRetentionCutoff(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    return cutoff;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldExports(): Promise<void> {
    const cutoff = this.getRetentionCutoff();
    this.logger.log(
      `Starting scheduled export cleanup. Retaining exports created after ${cutoff.toISOString()} (${this.retentionDays} days)`,
    );

    try {
      const eligibleExports = await this.repo.find({
        where: {
          createdAt: LessThan(cutoff),
          status: In(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
        },
        select: ['id', 'userId', 'status', 'createdAt'],
      });

      if (eligibleExports.length === 0) {
        this.logger.log('No expired exports found to clean up');
        return;
      }

      const result = await this.repo.update(
        {
          createdAt: LessThan(cutoff),
          status: In(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
        },
        { fileData: null, status: 'EXPIRED', expiredAt: new Date() },
      );

      this.logger.log(
        `Expired ${result.affected ?? 0} export(s) older than ${this.retentionDays} days`,
      );

      if (this.auditCleanupActions) {
        await this.logCleanupAuditTrail(eligibleExports, cutoff);
      }
    } catch (error) {
      this.logger.error(
        `Export cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async logCleanupAuditTrail(
    exports: { id: string; userId: string; status: string; createdAt: Date }[],
    cutoff: Date,
  ): Promise<void> {
    for (const exportRecord of exports) {
      try {
        await this.auditLogService.log({
          actionType: 'EXPORT_RETENTION_CLEANUP' as any,
          metadata: {
            entityType: 'data_export',
            entityId: exportRecord.id,
            exportId: exportRecord.id,
            requestId: exportRecord.id,
            previousStatus: exportRecord.status,
            newStatus: 'EXPIRED',
            retentionPolicyDays: this.retentionDays,
            retentionCutoffDate: cutoff.toISOString(),
            cleanedUpAt: new Date().toISOString(),
            actorType: 'system',
            actorId: 'retention-cleanup-scheduler',
          },
        });
      } catch (auditError) {
        this.logger.warn(
          `Failed to log audit trail for export ${exportRecord.id}: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`,
        );
      }
    }
  }

  async getRetentionPolicy(): Promise<RetentionPolicyConfig> {
    return {
      retentionDays: this.retentionDays,
      auditCleanupActions: this.auditCleanupActions,
    };
  }
}
