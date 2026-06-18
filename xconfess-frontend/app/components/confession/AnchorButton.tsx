"use client";

import { useState, type FC } from "react";
import { Anchor, CheckCircle2, ExternalLink, Loader2, AlertCircle, Wallet } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils/cn";
import { useActivityStore } from "@/app/lib/store/activity.store";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";

interface AnchorButtonProps {
  confessionId: string;
  confessionContent: string;
  isAnchored?: boolean;
  stellarTxHash?: string | null;
  onAnchorSuccess?: (txHash: string) => void;
  className?: string;
}

export const AnchorButton: FC<AnchorButtonProps> = ({
  confessionId,
  confessionContent,
  isAnchored = false,
  stellarTxHash = null,
  onAnchorSuccess,
  className,
}) => {
  const {
    isAvailable,
    isConnected,
    isReady,
    readinessError,
    connect,
    anchor,
    isLoading,
  } = useStellarWallet();
  const walletCTA = getWalletCTAState({
    isFreighterInstalled: isAvailable,
    isConnected,
    isReady,
    readinessError,
    isLoading,
  });

  const addActivity = useActivityStore((s) => s.addActivity);
  const updateActivity = useActivityStore((s) => s.updateActivity);

  const [isAnchoring, setIsAnchoring] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(stellarTxHash);
  const [error, setError] = useState<string | null>(null);
  const [anchored, setAnchored] = useState(isAnchored);

  const handleAnchor = async () => {
    if (isAnchoring || isLoading) return;
    setError(null);

    if (!isConnected) {
      try {
        await connect();
      } catch {
        setError("Failed to connect wallet. Please ensure Freighter is unlocked.");
        return;
      }
    }

    setIsAnchoring(true);

    const activityId = uuidv4();
    addActivity({
      id: activityId,
      type: "anchor",
      status: "requested",
      createdAt: Date.now(),
      confessionId,
    });

    try {
      const result = await anchor(confessionContent);

      if (result.success && result.txHash) {
        updateActivity(activityId, {
          status: "submitted",
          txHash: result.txHash,
        });

        const response = await fetch(`/api/confessions/${confessionId}/anchor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stellarTxHash: result.txHash,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save anchor");
        }

        updateActivity(activityId, {
          status: "confirmed",
          updatedAt: Date.now(),
        });

        setTxHash(result.txHash);
        setAnchored(true);
        onAnchorSuccess?.(result.txHash);
      } else {
        updateActivity(activityId, {
          status: "failed",
          updatedAt: Date.now(),
        });

        setError(result.error || "Failed to anchor confession");
      }
    } catch (err) {
      updateActivity(activityId, {
        status: "failed",
        updatedAt: Date.now(),
      });

      const message =
        err instanceof Error ? err.message : "Failed to anchor confession";
      setError(message);
    } finally {
      setIsAnchoring(false);
    }
  };

  if (anchored && txHash) {
    return (
      <div className={cn("stellar-anchor-action flex items-center gap-2", className)}>
        <CheckCircle2 className="h-4 w-4 text-green-400" />
        <span className="text-xs text-zinc-400">Anchored</span>
        <a
          href={getStellarExplorerUrl(txHash) ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (walletCTA.status === "not-installed") {
    return (
      <div className={cn("stellar-wallet-cta stellar-anchor-action flex flex-col gap-1.5", className)}>
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />
          <span className="text-xs text-yellow-400">{walletCTA.guidance}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("stellar-anchor-action flex flex-col gap-1", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={walletCTA.status === "not-connected" ? handleAnchor : handleAnchor}
        disabled={isAnchoring || walletCTA.disabled}
        className={cn(
          "h-7 px-2 text-xs",
          walletCTA.status === "not-connected" &&
            "stellar-wallet-cta border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300",
        )}
      >
        {isAnchoring || (isLoading && isConnected) ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Anchoring...
          </>
        ) : walletCTA.status === "not-connected" ? (
          <>
            <Wallet className="mr-1 h-3 w-3" />
            Connect Wallet to Anchor
          </>
        ) : (
          <>
            <Anchor className="mr-1 h-3 w-3" />
            Anchor
          </>
        )}
      </Button>

      {walletCTA.status === "not-connected" && walletCTA.guidance && (
        <p className="text-xs text-zinc-500">{walletCTA.guidance}</p>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}

      {walletCTA.status === "not-ready" && !error && (
        <div className="text-xs text-orange-400">{walletCTA.guidance}</div>
      )}
    </div>
  );
};
