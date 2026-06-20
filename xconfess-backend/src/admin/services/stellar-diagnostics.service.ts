import { Injectable, Logger } from '@nestjs/common';
import { StellarConfigService } from '../../stellar/stellar-config.service';
import { DeploymentMetadataService } from '../../stellar/services/deployment-metadata.service';

export type HorizonStatus = 'ok' | 'degraded' | 'unreachable';

export interface StellarDiagnosticsResult {
  network: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  contractIds: {
    confessionAnchor: string | null;
    reputationBadges: string | null;
    tippingSystem: string | null;
  };
  horizonStatus: HorizonStatus;
  horizonLatencyMs: number | null;
  deploymentMetadata: {
    loaded: boolean;
    generatedAtUtc: string | null;
    isStale: boolean;
    ageDays: number | null;
    loadError: string | null;
  };
  checkedAt: string;
}

@Injectable()
export class StellarDiagnosticsService {
  private readonly logger = new Logger(StellarDiagnosticsService.name);

  constructor(
    private readonly stellarConfigService: StellarConfigService,
    private readonly deploymentMetadataService: DeploymentMetadataService,
  ) {}

  async getDiagnostics(): Promise<StellarDiagnosticsResult> {
    const config = this.stellarConfigService.getConfig();
    const metadataFreshness = this.deploymentMetadataService.getMetadataFreshness();

    const { status: horizonStatus, latencyMs: horizonLatencyMs } =
      await this.pingHorizon(config.horizonUrl);

    return {
      network: config.network,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      contractIds: {
        confessionAnchor: config.contractIds.confessionAnchor ?? null,
        reputationBadges: config.contractIds.reputationBadges ?? null,
        tippingSystem: config.contractIds.tippingSystem ?? null,
      },
      horizonStatus,
      horizonLatencyMs,
      deploymentMetadata: {
        loaded: !!this.deploymentMetadataService.getMetadata(),
        generatedAtUtc: metadataFreshness.generatedAtUtc,
        isStale: metadataFreshness.isStale,
        ageDays:
          metadataFreshness.daysSinceGeneration >= 0
            ? metadataFreshness.daysSinceGeneration
            : null,
        loadError: this.deploymentMetadataService.getLoadError(),
      },
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Lightweight Horizon liveness check — hits GET / on the Horizon base URL.
   * Never throws; returns 'unreachable' or 'degraded' on failure so callers
   * can surface a warning state rather than a 500.
   */
  private async pingHorizon(
    horizonUrl: string,
  ): Promise<{ status: HorizonStatus; latencyMs: number | null }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(horizonUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { status: 'ok', latencyMs };
      }

      this.logger.warn(
        `Horizon ping returned HTTP ${response.status} from ${horizonUrl}`,
      );
      return { status: 'degraded', latencyMs };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Horizon ping failed for ${horizonUrl}: ${message}`);
      return { status: 'unreachable', latencyMs };
    }
  }
}