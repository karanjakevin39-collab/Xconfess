"use client";

import { useState, useEffect, useCallback } from "react";
import { Gender } from "@/app/lib/utils/validation";

export interface Draft {
  id: string;
  title?: string;
  body: string;
  gender?: Gender;
  savedAt: number;
  characterCount: number;
  scheduledFor?: string;
  timezone?: string;
}

const STORAGE_KEY = "xconfess-drafts";
const MAX_DRAFTS = 10;

// Issue #678: Global flag to suppress repeated console noise in local dev/private browsing
let hasWarnedStorageError = false;

export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as Draft[];
        }
      } catch (error) {
        // Suppress initial load error noise
      }
    }
    return [];
  });

  // Issue #454: Listen for draft updates from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const newDrafts = JSON.parse(e.newValue) as Draft[];
          setDrafts(newDrafts);
        } catch (error) {
          // Suppress sync error noise
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const saveDrafts = useCallback((newDrafts: Draft[]) => {
    const sorted = [...newDrafts]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_DRAFTS);

    // Update state first to keep the app resilient in-memory
    setDrafts(sorted);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch (error) {
      // Issue #678: Replace repeated logging with a single user-friendly fallback path
      if (!hasWarnedStorageError) {
        console.warn(
          "Xconfess: Draft persistence unavailable (localStorage). Drafts will not be saved across refreshes.",
        );
        hasWarnedStorageError = true;
      }
    }
  }, []);

  const saveDraft = useCallback(
    (draft: Omit<Draft, "id" | "savedAt" | "characterCount">): string => {
      const newDraft: Draft = {
        ...draft,
        id: crypto.randomUUID(),
        savedAt: Date.now(),
        characterCount: (draft.title?.length || 0) + draft.body.length,
      };

      const updated = [newDraft, ...drafts.filter((d) => d.id !== newDraft.id)];
      saveDrafts(updated);

      return newDraft.id;
    },
    [drafts, saveDrafts],
  );

  const updateDraft = useCallback(
    (id: string, updates: Partial<Omit<Draft, "id" | "savedAt">>) => {
      const updated = drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              ...updates,
              savedAt: Date.now(),
              characterCount:
                (updates.title?.length || draft.title?.length || 0) +
                (updates.body?.length || draft.body.length),
            }
          : draft,
      );
      saveDrafts(updated);
    },
    [drafts, saveDrafts],
  );

  const deleteDraft = useCallback(
    (id: string) => {
      const updated = drafts.filter((d) => d.id !== id);
      saveDrafts(updated);
    },
    [drafts, saveDrafts],
  );

  const clearDrafts = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Silent fail
    }
    setDrafts([]);
  }, []);

  const loadDraft = useCallback(
    (id: string): Draft | undefined => {
      return drafts.find((d) => d.id === id);
    },
    [drafts],
  );

  return {
    drafts,
    saveDraft,
    updateDraft,
    deleteDraft,
    clearDrafts,
    loadDraft,
  };
}
