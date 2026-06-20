'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchStellarDiagnostics } from '@/app/lib/api/stellar';
import { adminApi } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import type { StellarDiagnosticsResponse, HorizonStatus } from '@/app/lib/api/stellar';

function ConfigRow({
  label,
  value,
  mono,
  description,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  description?: string;
}) {
  return (
    <div className="flex flex-col py-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-48 shrink-0">
          {label}
        </dt>
        <dd
          className={`text-sm text-gray-900 dark:text-white break-all ${mono ? 'font-mono text-xs text-teal-600 dark:text-teal-400' : ''}`}
        >
          {value || (
            <span className="text-amber-500 dark:text-amber-400 italic bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded text-xs border border-amber-200 dark:border-amber-900/50">
              Not configured
            </span>
          )}
        </dd>
      </div>
      {description && (
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-500 max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      ))}
    </div>
  );
}

const HORIZON_STATUS_CONFIG: Record<
  HorizonStatus,
  { label: string; badgeClass: string; bannerClass: string; icon: string }
> = {
  ok: {
    label: 'Reachable',
    badgeClass:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800',
    bannerClass: '',
    icon: '●',
  },
  degraded: {
    label: 'Degraded',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    bannerClass:
      'rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 mt-4',
    icon: '▲',
  },
  unreachable: {
    label: 'Unreachable',
    badgeClass:
      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800',
    bannerClass:
      'rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 mt-4',
    icon: '✕',
  },
};

function HorizonStatusCard({
  status,
  latencyMs,
  horizonUrl,
  checkedAt,
}: {
  status: HorizonStatus;
  latencyMs: number | null;
  horizonUrl: string;
  checkedAt: string;
}) {
  const cfg = HORIZON_STATUS_CONFIG[status];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Horizon RPC Status
        </h3>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badgeClass}`}>
          <span>{cfg.icon}</span>
          {cfg.label}
        </span>
      </div>

      <dl className="divide-y divide-gray-100 dark:divide-gray-800">
        <ConfigRow
          label="Endpoint"
          value={horizonUrl}
          mono
          description="The Horizon REST API endpoint that was pinged."
        />
        <ConfigRow
          label="Latency"
          value={latencyMs !== null ? `${latencyMs} ms` : 'N/A'}
          description="Round-trip time for the liveness ping to Horizon."
        />
        <ConfigRow
          label="Checked at"
          value={new Date(checkedAt).toLocaleString()}
          description="Timestamp when this diagnostic snapshot was taken."
        />
      </dl>

      {status !== 'ok' && (
        <div className={cfg.bannerClass}>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {status === 'unreachable'
              ? 'Horizon is unreachable. Anchoring and on-chain operations will fail until connectivity is restored.'
              : 'Horizon returned a non-success response. Some operations may be impaired.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  const {
    data: diagnostics,
    isLoading,
    error,
  } = useQuery<StellarDiagnosticsResponse>({
    queryKey: ['stellar', 'diagnostics'],
    queryFn: fetchStellarDiagnostics,
    retry: 2,
    staleTime: 60_000,
  });

  const {
    data: observability,
    isLoading: observabilityLoading,
    error: observabilityError,
  } = useQuery({
    queryKey: queryKeys.admin.observability.all(),
    queryFn: () => adminApi.getObservability(),
    staleTime: 60_000,
    retry: 2,
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Stellar Diagnostics
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Network environments and configured smart contract addresses. Includes a live
          Horizon reachability check.
        </p>
      </div>

      {isLoading && <Skeleton />}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-5 space-y-2">
          <p className="text-sm font-semibold text-red-800 dark:text-red-400">
            Failed to load Stellar diagnostics.
          </p>
          <p className="text-xs text-red-700 dark:text-red-300/80">
            Ensure the backend is running and accessible, and that your session has admin
            permissions.
          </p>
        </div>
      )}

      {diagnostics && (
        <div className="grid gap-6">
          {/* Horizon ping status */}
          <HorizonStatusCard
            status={diagnostics.horizonStatus}
            latencyMs={diagnostics.horizonLatencyMs}
            horizonUrl={diagnostics.horizonUrl}
            checkedAt={diagnostics.checkedAt}
          />

          {/* Network Info */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Network Profile
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Active network context and RPC endpoints.
            </p>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              <ConfigRow
                label="Target Network"
                value={diagnostics.network}
                mono
                description="The target environment (e.g., testnet, mainnet) governing ledger operations."
              />
              <ConfigRow
                label="Horizon URL"
                value={diagnostics.horizonUrl}
                mono
                description="REST API gateway for ledger statistics, account metadata, and history."
              />
              <ConfigRow
                label="Soroban RPC URL"
                value={diagnostics.sorobanRpcUrl}
                mono
                description="Execution node gateway for smart contract invocations."
              />
            </dl>
          </div>

          {/* Contract IDs */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Smart Contract Deployments
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Soroban contract IDs anchoring active WASM state machines to the network.
            </p>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              <ConfigRow
                label="Confession Anchor"
                value={diagnostics.contractIds?.confessionAnchor}
                mono
                description="Tracks data hashes for anonymized confessions on-chain."
              />
              <ConfigRow
                label="Reputation Badges"
                value={diagnostics.contractIds?.reputationBadges}
                mono
                description="Manages profile reward distribution and gamification tiers."
              />
              <ConfigRow
                label="Tipping System"
                value={diagnostics.contractIds?.tippingSystem}
                mono
                description="Handles atomic peer micro-payments between users."
              />
            </dl>
          </div>

          {/* Deployment Metadata */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Deployment Metadata
            </h3>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              <ConfigRow
                label="Loaded"
                value={diagnostics.deploymentMetadata.loaded ? 'Yes' : 'No'}
              />
              <ConfigRow
                label="Generated at (UTC)"
                value={diagnostics.deploymentMetadata.generatedAtUtc}
                mono
              />
              <ConfigRow
                label="Age (days)"
                value={diagnostics.deploymentMetadata.ageDays?.toString() ?? null}
              />
              <ConfigRow
                label="Stale"
                value={diagnostics.deploymentMetadata.isStale ? 'Yes' : 'No'}
              />
              <ConfigRow
                label="Load error"
                value={diagnostics.deploymentMetadata.loadError}
                mono
              />
            </dl>
            {diagnostics.deploymentMetadata.loadError && (
              <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
                {diagnostics.deploymentMetadata.loadError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Observability */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Admin Observability
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Audit activity and notification queue health for operational review.
            </p>
          </div>
        </div>

        {observabilityLoading && <Skeleton />}

        {observabilityError && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              Failed to load admin observability metrics. Ensure the backend is running and
              accessible.
            </p>
          </div>
        )}

        {observability && (
          <div className="grid gap-6">
            <div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                Audit activity
              </h4>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Total logs</dt>
                  <dd className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {observability.audit.totalLogs}
                  </dd>
                </div>
                {observability.audit.actionTypeCounts.map((count) => (
                  <div
                    key={count.actionType}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4"
                  >
                    <dt className="text-sm text-gray-500 dark:text-gray-400">
                      {count.actionType}
                    </dt>
                    <dd className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                      {count.count}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                Notification queue health
              </h4>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { label: 'Active workers', value: observability.notifications.main.active },
                  { label: 'Waiting jobs', value: observability.notifications.main.waiting },
                  { label: 'Failed jobs', value: observability.notifications.main.failed },
                  { label: 'DLQ failed', value: observability.notifications.dlq.failed },
                  { label: 'DLQ waiting', value: observability.notifications.dlq.waiting },
                  { label: 'DLQ delayed', value: observability.notifications.dlq.delayed },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4"
                  >
                    <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
                    <dd className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] font-medium tracking-wide text-gray-400 dark:text-slate-500 text-center bg-gray-50 dark:bg-gray-950/60 py-3 rounded-lg border border-gray-100 dark:border-gray-800/60">
        🔒 Signer keys, seed phrases, and operational secrets are never exposed in this panel.
      </div>
    </div>
  );
}