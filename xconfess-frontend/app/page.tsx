"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import {
  ArrowDown,
  Compass,
  Feather,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import Header from "./components/layout/Header";
import { ConfessionFeed } from "./components/confession/ConfessionFeed";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Button } from "./components/ui/button";

const EnhancedConfessionForm = dynamic(
  () =>
    import("./components/confession/EnhancedConfessionForm").then((mod) => ({
      default: mod.EnhancedConfessionForm,
    })),
  {
    loading: () => (
        <div className="luxury-panel animate-pulse rounded-[34px] p-8">
          <div className="mb-4 h-4 w-28 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-3 h-8 w-64 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-8 h-5 w-72 rounded-full bg-[var(--surface-muted)]" />
          <div className="mb-4 h-14 w-full rounded-[22px] bg-[var(--surface-muted)]" />
          <div className="mb-4 h-12 w-full rounded-[22px] bg-[var(--surface-muted)]" />
          <div className="h-64 w-full rounded-[28px] bg-[var(--surface-muted)]" />
      </div>
    ),
    ssr: false,
  },
);

const trustSignals = [
  {
    icon: Lock,
    title: "Private by default",
    description:
      "An anonymous-first experience with gentler moderation and fewer performative distractions.",
  },
  {
    icon: Feather,
    title: "Designed for thoughtful writing",
    description:
      "A premium composition flow that feels closer to a private journal than a noisy social feed.",
  },
  {
    icon: ShieldCheck,
    title: "Credibility when it matters",
    description:
      "Optional Stellar anchoring adds proof-of-existence without forcing permanence on every story.",
  },
];

const highlights = [
  { icon: Sparkles, label: "Curated calm" },
  { icon: Compass, label: "Readable feed" },
  { icon: Star, label: "Premium writing space" },
];

export default function Home() {
  const scrollToComposer = useCallback(() => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const scrollToFeed = useCallback(() => {
    document.getElementById("feed")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <>
      <Header />

      <main className="editorial-shell relative overflow-hidden pb-24">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_380px] lg:items-start">
            <div className="space-y-8">
              <div className="eyebrow">Anonymous stories, elevated</div>

              <div className="max-w-4xl space-y-6">
                <h1 className="font-editorial text-5xl leading-[0.95] text-[var(--foreground)] sm:text-6xl lg:text-7xl">
                  A quieter, more luxurious home for anonymous truth.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--secondary)] sm:text-lg">
                  XConfess is being redesigned as a premium editorial experience:
                  warm, private, and composed. Write with intention, explore the
                  community without clutter, and preserve what matters only when
                  you choose to.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {highlights.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="luxury-panel inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--secondary)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--primary-deep)]" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={scrollToComposer}>
                  Begin writing
                </Button>
                <Button size="lg" variant="outline" onClick={scrollToFeed}>
                  Browse confessions
                </Button>
              </div>
            </div>

            <aside className="luxury-panel rounded-[34px] p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Editorial brief</p>
                  <h2 className="mt-3 font-editorial text-4xl text-[var(--foreground)]">
                    Premium, not flashy
                  </h2>
                </div>
                <div className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary-deep)]">
                  New look
                </div>
              </div>

              <div className="section-divider my-6" />

              <div className="space-y-4">
                {trustSignals.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-[26px] border border-[var(--border)] bg-[var(--surface-muted)] p-5"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--primary-deep)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-editorial text-2xl text-[var(--foreground)]">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--secondary)]">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className="luxury-panel grid gap-8 rounded-[36px] px-6 py-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <p className="eyebrow">What changes with this direction</p>
              <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                Cleaner reading rhythm. Better hierarchy. More trust.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                "Warmer surfaces that feel like premium paper instead of generic app cards.",
                "A writing flow that reads like a private notebook, not a comment box.",
                "Confession cards designed for emotional clarity and slower, better reading.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-7 text-[var(--secondary)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <ErrorBoundary>
            <section
              id="composer"
              className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_320px] lg:items-start"
            >
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="eyebrow">Private desk</p>
                  <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                    Compose with intention
                  </h2>
                  <p className="max-w-2xl text-sm leading-8 text-[var(--secondary)] sm:text-base">
                    This composer is being reframed as a premium writing surface:
                    quieter controls, cleaner typography, and more confidence in
                    every action from drafting to publishing.
                  </p>
                </div>

                <EnhancedConfessionForm className="rounded-[34px] p-1" />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28">
                <div className="luxury-panel rounded-[30px] p-6">
                  <p className="eyebrow">Posting notes</p>
                  <div className="mt-5 space-y-4">
                    {[
                      "Protect identities and preserve emotional context.",
                      "Use titles sparingly and let the story breathe.",
                      "Anchor only the confessions you genuinely need to preserve.",
                    ].map((tip) => (
                      <div
                        key={tip}
                        className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-7 text-[var(--secondary)]"
                      >
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={scrollToFeed}
                  className="luxury-panel flex w-full items-center justify-between rounded-[28px] px-5 py-4 text-left text-[var(--foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <div>
                    <p className="eyebrow">Continue reading</p>
                    <p className="mt-2 font-editorial text-3xl">
                      Community feed
                    </p>
                  </div>
                  <ArrowDown className="h-5 w-5 text-[var(--primary-deep)]" />
                </button>
              </aside>
            </section>

            <section id="feed" className="space-y-6 pt-6">
              <div className="space-y-3">
                <p className="eyebrow">Recent confessions</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                      Read the room
                    </h2>
                    <p className="max-w-2xl text-sm leading-8 text-[var(--secondary)] sm:text-base">
                      Feed cards are now treated like editorial excerpts:
                      quieter framing, stronger typography, and more generous
                      spacing so each confession feels worth reading.
                    </p>
                  </div>
                </div>
              </div>

              <ConfessionFeed />
            </section>
          </ErrorBoundary>
        </section>
      </main>
    </>
  );
}
