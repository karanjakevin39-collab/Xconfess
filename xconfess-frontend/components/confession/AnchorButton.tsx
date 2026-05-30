/**
 * AnchorButton.tsx
 * Issue #196 – Block anchor submission on network mismatch with actionable copy
 * Issue #198 – Prevent duplicate anchor verification submits
 *
 * Uses the real useStellarWallet contract:
 *   isLoading       (not isConnecting)
 *   isReady         (wallet connected + correct network)
 *   readinessError  (human-readable reason isReady is false)
 *   anchor(content) (not signAndSubmitAnchorTx)
 */

"use client";

import React, { useCallback, useRef, useState } from "react";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";

interface AnchorButtonProps {
  confessionId: string;
  content: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

type SubmitState = "idle" | "pending" | "success" | "error";

export function AnchorButton({
  confessionId,
  content,
  onSuccess,
  onError,
}: AnchorButtonProps) {
  const wallet = useStellarWallet();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Issue #198 – guard against duplicate in-flight submits
  const inFlightRef = useRef(false);

  const handleAnchor = useCallback(async () => {
    if (inFlightRef.current || submitState === "pending") return;

    inFlightRef.current = true;
    setSubmitState("pending");
    setErrorMsg(null);

    try {
      await wallet.anchor(content);
      setSubmitState("success");
      onSuccess?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setSubmitState("error");
      setErrorMsg(e.message);
      onError?.(e);
    } finally {
      inFlightRef.current = false;
    }
  }, [content, onError, onSuccess, submitState, wallet]);

  // Not yet connected
  if (!wallet.isConnected) {
    return (
      <button
        type="button"
        onClick={wallet.connect}
        disabled={wallet.isLoading}
        className="anchor-btn anchor-btn--connect"
      >
        {wallet.isLoading ? "Connecting…" : "Connect Wallet to Anchor"}
      </button>
    );
  }

  // Issue #196 – connected but not ready (network mismatch or other readiness failure)
  if (!wallet.isReady) {
    return (
      <div className="anchor-mismatch" role="alert">
        <p className="anchor-mismatch__message">
          {wallet.readinessError ??
            "Wallet is not ready. Please check your network in Freighter."}
        </p>
        <button
          type="button"
          className="anchor-btn anchor-btn--disabled"
          disabled
        >
          Anchor Confession
        </button>
      </div>
    );
  }

  return (
    <div className="anchor-action">
      <button
        type="button"
        onClick={handleAnchor}
        // Issue #198 – disabled while in-flight
        disabled={submitState === "pending" || submitState === "success"}
        className={`anchor-btn anchor-btn--${submitState}`}
        aria-busy={submitState === "pending"}
      >
        {submitState === "pending" && "Anchoring…"}
        {submitState === "success" && "Anchored ✓"}
        {(submitState === "idle" || submitState === "error") &&
          "Anchor Confession"}
      </button>
      {submitState === "error" && errorMsg && (
        <p className="anchor-action__error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
