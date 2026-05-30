"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addReaction, type AddReactionResponse } from "@/app/lib/api/reactions";
import {
  restoreQuerySnapshots,
  snapshotConfessionQueries,
  updateConfessionQueries,
} from "@/app/lib/api/confessionCache";
import type { ReactionType, ReactionCounts } from "@/app/lib/types/reaction";
import { queryKeys } from "@/app/lib/api/queryKeys";

export interface ReactionState {
  counts: ReactionCounts;
  userReaction: ReactionType | null;
}

export interface UseReactionsOptions {
  /**
   * Initial reaction counts for the confession
   */
  initialCounts?: ReactionCounts;
  /**
   * Initial user reaction state (the reaction type the user already has)
   */
  initialUserReaction?: ReactionType | null;
  /**
   * Callback when reaction is successfully added
   */
  onSuccess?: (result: AddReactionResponse) => void;
  /**
   * Callback when reaction addition fails
   */
  onError?: (error: Error | AddReactionResponse) => void;
}

export interface UseReactionsReturn {
  /**
   * Add a reaction with optimistic update
   */
  addReaction: (confessionId: string, type: ReactionType) => Promise<AddReactionResponse>;
  /**
   * Remove a reaction (currently unsupported by the backend API)
   */
  removeReaction: (confessionId: string, type: ReactionType) => Promise<AddReactionResponse>;
  /**
   * Whether a mutation is in progress
   */
  isPending: boolean;
  /**
   * Whether there's an error
   */
  isError: boolean;
  /**
   * The error if any
   */
  error: Error | null;
  /**
   * Optimistic state for immediate UI updates
   */
  optimisticState: ReactionState | null;
  /**
   * Clear optimistic state (rollback)
   */
  clearOptimisticState: () => void;
  /**
   * Update optimistic counts directly
   */
  updateOptimisticCounts: (counts: ReactionCounts) => void;
  /**
   * Set error state for external handling
   */
  setErrorState: (error: Error | null) => void;
}

function normalizeCounts(counts?: Partial<ReactionCounts> | null): ReactionCounts {
  return {
    like: Math.max(0, counts?.like ?? 0),
    love: Math.max(0, counts?.love ?? 0),
  };
}

function incrementReactionCount(
  counts: Partial<ReactionCounts> | null | undefined,
  type: ReactionType,
): ReactionCounts {
  const normalized = normalizeCounts(counts);
  return {
    ...normalized,
    [type]: normalized[type] + 1,
  };
}

/**
 * Hook for managing reactions with optimistic updates and rollback.
 * 
 * Features:
 * - Optimistic updates for immediate UI feedback
 * - Automatic rollback on error
 * - Cache invalidation after successful mutation
 * - Exposed state for testing and debugging
 */
export function useReactions(options: UseReactionsOptions = {}): UseReactionsReturn {
  const { initialCounts, initialUserReaction, onSuccess, onError } = options;
  const queryClient = useQueryClient();
  
  // Local state for optimistic UI updates (complements React Query cache)
  const [optimisticState, setOptimisticState] = useState<ReactionState | null>(null);
  const [localError, setLocalError] = useState<Error | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      confessionId,
      type,
    }: {
      confessionId: string;
      type: ReactionType;
    }) => {
      const result = await addReaction(confessionId, type);

      if (!result.ok) {
        throw new Error(result.error.message || "Failed to add reaction");
      }

      return result;
    },

    // Called before the mutation function
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.confessions.all });
      const previousConfessionQueries = snapshotConfessionQueries(queryClient);

      updateConfessionQueries(
        queryClient,
        variables.confessionId,
        (confession) => ({
          ...confession,
          reactions: incrementReactionCount(
            confession.reactions as Partial<ReactionCounts> | undefined,
            variables.type,
          ),
        }),
      );

      // Set optimistic state for hook consumers
      const newCounts = incrementReactionCount(initialCounts, variables.type);

      setOptimisticState({
        counts: newCounts,
        userReaction: variables.type,
      });
      setLocalError(null);

      // Return context with previous values for rollback
      return {
        previousConfessionQueries,
      };
    },

    // Called if mutation fails
    onError: (error, _variables, context) => {
      // Set error state
      setLocalError(error as Error);

      // Rollback to previous values
      restoreQuerySnapshots(queryClient, context?.previousConfessionQueries);

      // Clear optimistic state
      setOptimisticState(null);

      // Call error callback
      if (onError) {
        onError(error as Error);
      }
    },

    onSuccess: (result, variables) => {
      // Only update cache if we had optimistic state
      if (result.data.reactions) {
        const serverCounts = normalizeCounts(result.data.reactions);

        updateConfessionQueries(
          queryClient,
          variables.confessionId,
          (confession) => ({
            ...confession,
            reactions: serverCounts,
          }),
        );

        setOptimisticState({
          counts: serverCounts,
          userReaction: variables.type,
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: queryKeys.confessions.all,
        });
      }
    },

    // Called after mutation settles (success or error)
    onSettled: () => {
      // Clear optimistic state after invalidation (keep for a moment for smooth UI)
      setTimeout(() => {
        setOptimisticState(null);
      }, 100);
    },
  });

  const handleAddReaction = useCallback(async (
    confessionId: string,
    type: ReactionType
  ): Promise<AddReactionResponse> => {
    // If user already has this reaction, skip optimistic update (no count change expected)
    const alreadyReacted = initialUserReaction === type;
    if (alreadyReacted) {
      // Still call the API to get the latest state, but don't optimistically update
      const result = await addReaction(confessionId, type);
      
      // Backend returns success with existing reaction (no change)
      // We don't need to do anything special here - the UI already shows the correct state
      if (onSuccess && result.ok) {
        onSuccess(result);
      }
      
      return result;
    }
    
    try {
      const result = await mutation.mutateAsync({ confessionId, type, alreadyReacted: false });

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      // Error is already handled in onError callback
      return {
        ok: false,
        error: { 
          message: error instanceof Error ? error.message : "Failed to add reaction",
          code: "MUTATION_ERROR"
        },
      };
    }
  }, [mutation, onSuccess, initialUserReaction]);

  const handleRemoveReaction = useCallback(async (
    _confessionId: string,
    _type: ReactionType
  ): Promise<AddReactionResponse> => {
    const error = {
      message: "Removing reactions is not supported by the current API.",
      code: "UNSUPPORTED_OPERATION",
    } as const;

    setLocalError(new Error(error.message));
    return {
      ok: false,
      error,
    };
  }, []);

  const clearOptimisticState = useCallback(() => {
    setOptimisticState(null);
    setLocalError(null);
  }, []);

  const updateOptimisticCounts = useCallback((counts: ReactionCounts) => {
    setOptimisticState((prev) => {
      if (!prev) {
        return {
          counts,
          userReaction: initialUserReaction || null,
        };
      }
      return {
        ...prev,
        counts,
      };
    });
  }, [initialUserReaction]);

  const setErrorState = useCallback((error: Error | null) => {
    setLocalError(error);
  }, []);

  return {
    addReaction: handleAddReaction,
    removeReaction: handleRemoveReaction,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: localError || mutation.error,
    optimisticState,
    clearOptimisticState,
    updateOptimisticCounts,
    setErrorState,
  };
}
