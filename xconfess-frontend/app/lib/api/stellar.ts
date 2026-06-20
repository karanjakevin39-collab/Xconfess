import apiClient from './client';
import type { StellarConfigResponse } from '../types/stellar';

export async function fetchStellarConfig(): Promise<StellarConfigResponse> {
  const response = await apiClient.get<StellarConfigResponse>('/stellar/config');
  return response.data;
}

export type HorizonStatus = 'ok' | 'degraded' | 'unreachable';

export interface StellarDiagnosticsResponse {
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

export async function fetchStellarDiagnostics(): Promise<StellarDiagnosticsResponse> {
  const response = await apiClient.get<StellarDiagnosticsResponse>(
    '/api/admin/stellar/diagnostics',
  );
  return response.data;
}