/**
 * useStellarWallet.ts
 * Issue #194 – Fix React Compiler preservation error & stabilise callback contract
 * Issue #196 – Expose network-mismatch state for callers to gate CTAs
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type WalletNetwork = "testnet" | "mainnet" | "unknown";

export interface StellarWalletState {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  network: WalletNetwork;
  networkMismatch: boolean;
  error: string | null;
}

export interface UseStellarWalletReturn extends StellarWalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  signAndSubmitAnchorTx: (xdr: string) => Promise<string>;
}

const APP_NETWORK: WalletNetwork =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as WalletNetwork) ?? "testnet";

function detectNetwork(networkPassphrase: string | undefined): WalletNetwork {
  if (!networkPassphrase) return "unknown";
  if (networkPassphrase.includes("Test")) return "testnet";
  if (networkPassphrase.includes("Public")) return "mainnet";
  return "unknown";
}

export function useStellarWallet(): UseStellarWalletReturn {
  const [state, setState] = useState<StellarWalletState>({
    publicKey: null,
    isConnected: false,
    isConnecting: false,
    network: "unknown",
    networkMismatch: false,
    error: null,
  });

  // Stable ref so callbacks never need the state value in their dep-array
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      // @ts-expect-error – freighter-api types may not be installed in all envs
      const freighter = await import("@stellar/freighter-api");
      const isAllowed = await freighter.isConnected();
      if (!isAllowed) {
        await freighter.requestAccess();
      }
      const publicKey = await freighter.getPublicKey();
      const { networkPassphrase } = await freighter.getNetworkDetails();
      const network = detectNetwork(networkPassphrase);
      const networkMismatch = network !== "unknown" && network !== APP_NETWORK;

      setState({
        publicKey,
        isConnected: true,
        isConnecting: false,
        network,
        networkMismatch,
        error: networkMismatch
          ? `Wallet is on ${network} but the app expects ${APP_NETWORK}. Please switch networks in Freighter.`
          : null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : "Failed to connect wallet",
      }));
    }
  }, []); // no state dependencies – uses stateRef where needed

  // ── disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setState({
      publicKey: null,
      isConnected: false,
      isConnecting: false,
      network: "unknown",
      networkMismatch: false,
      error: null,
    });
  }, []);

  // ── signAndSubmitAnchorTx ─────────────────────────────────────────────────
  const signAndSubmitAnchorTx = useCallback(
    async (xdr: string): Promise<string> => {
      const { isConnected, networkMismatch, publicKey } = stateRef.current;

      if (!isConnected || !publicKey) {
        throw new Error("Wallet is not connected.");
      }
      if (networkMismatch) {
        throw new Error(
          `Network mismatch: wallet is not on ${APP_NETWORK}. Please switch networks.`,
        );
      }

      // @ts-expect-error – freighter-api types
      const freighter = await import("@stellar/freighter-api");
      const { signedXDR } = await freighter.signTransaction(xdr, {
        network: APP_NETWORK,
        accountToSign: publicKey,
      });
      return signedXDR;
    },
    [],
  ); // stable – reads from stateRef, not reactive state

  return {
    ...state,
    connect,
    disconnect,
    signAndSubmitAnchorTx,
  };
}
