"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Eye } from "lucide-react";
import { ReactionButton } from "./ReactionButtons";
import { AnchorButton } from "./AnchorButton";
import { TipButton } from "./TipButton";
import { Checkbox } from "@/app/components/ui/checkbox";
import { useComparisonStore } from "@/app/lib/store/comparisonStore";
import type { NormalizedConfession } from "../../lib/utils/normalizeConfession";
import { getTipStats, type TipStats } from "@/lib/services/tipping.service";

interface Props {
  confession: NormalizedConfession;
}

export const ConfessionCard = memo(({ confession }: Props) => {
  const [isAnchored, setIsAnchored] = useState(confession.isAnchored || false);
  const [txHash, setTxHash] = useState<string | null>(
    confession.stellarTxHash || null
  );
  const [tipStats, setTipStats] = useState<TipStats | null>(
    confession.tipStats || null
  );
  const { addItem, removeItem, isSelected } = useComparisonStore();

  useEffect(() => {
    if (!tipStats) {
      getTipStats(confession.id).then((stats) => {
        if (stats) {
          setTipStats(stats);
        }
      });
    }
  }, [confession.id, tipStats]);

  const handleAnchorSuccess = (newTxHash: string) => {
    setIsAnchored(true);
    setTxHash(newTxHash);
  };

  const handleCompareToggle = (checked: boolean) => {
    if (checked) {
      addItem(confession.id);
    } else {
      removeItem(confession.id);
    }
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 1000
    );

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <article className="luxury-panel rounded-[30px] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--surface-strong)]">
      <div className="mb-5 flex items-center justify-between border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          {confession.author?.avatar ? (
            <Image
              src={confession.author.avatar}
              alt={confession.author?.username || "Anonymous"}
              width={44}
              height={44}
              className="rounded-full border border-[var(--border)] bg-[var(--skeleton)] object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--primary-deep)]">
              A
            </div>
          )}

          <div>
            <p className="font-editorial text-2xl text-[var(--foreground)]">
              {confession.author?.username || "Anonymous"}
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--secondary)]">
              Community post
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--secondary)] sm:text-sm">
            {timeAgo(confession.createdAt)}
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`compare-${confession.id}`}
              checked={isSelected(confession.id)}
              onCheckedChange={handleCompareToggle}
            />
            <label
              htmlFor={`compare-${confession.id}`}
              className="text-xs text-[var(--secondary)] cursor-pointer"
            >
              Compare
            </label>
          </div>
        </div>
      </div>

      <Link href={`/confessions/${confession.id}`} className="group block">
        <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[var(--primary-deep)]">
          Confession
        </p>
        <p className="mb-5 font-editorial text-[1.65rem] leading-[1.5] text-[var(--foreground)] transition-colors group-hover:text-black">
          {confession.content}
        </p>
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 text-sm text-[var(--secondary)]">
          {confession.viewCount !== undefined && (
            <div className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3">
              <Eye className="h-4 w-4" />
              <span>{confession.viewCount}</span>
            </div>
          )}

          {confession.commentCount !== undefined && (
            <Link
              href={`/confessions/${confession.id}#comments`}
              className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 transition-colors hover:text-[var(--foreground)]"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{confession.commentCount}</span>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TipButton
            confessionId={confession.id}
            recipientAddress={confession.author?.stellarAddress}
            initialStats={tipStats || undefined}
          />
          <AnchorButton
            confessionId={confession.id}
            confessionContent={confession.content}
            isAnchored={isAnchored}
            stellarTxHash={txHash}
            onAnchorSuccess={handleAnchorSuccess}
          />
          <div className="flex gap-2">
            <ReactionButton
              type="like"
              count={confession.reactions.like}
              confessionId={confession.id}
            />
            <ReactionButton
              type="love"
              count={confession.reactions.love}
              confessionId={confession.id}
            />
          </div>
        </div>
      </div>
    </article>
  );
});
