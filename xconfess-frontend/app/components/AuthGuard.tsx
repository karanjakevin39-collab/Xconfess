'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../lib/hooks/useAuth';

/**
 * Maximum number of consecutive redirect attempts before the guard
 * assumes a loop and stops redirecting. This prevents the browser from
 * entering an infinite redirect cycle when, e.g., the session cookie is
 * present but permanently invalid.
 */
const MAX_REDIRECT_ATTEMPTS = 3;

/**
 * Minimum interval (ms) between consecutive redirect calls.
 * Prevents rapid-fire navigation during React re-render bursts.
 */
const REDIRECT_COOLDOWN_MS = 2000;

/**
 * AuthGuard component props
 */
interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard Component
 *
 * Protects routes by redirecting unauthenticated users to the login page.
 * Includes safeguards against:
 * - Redirect loops (capped at MAX_REDIRECT_ATTEMPTS)
 * - Stale/expired session cookies (shows user-friendly error)
 * - Race conditions during auth refresh (cooldown debounce)
 * - Navigating away from /login back into a redirect (pathname check)
 *
 * @example
 * ```tsx
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, isSessionExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // --- Redirect-loop protection refs (survive re-renders) ---
  const redirectCount = useRef(0);
  const lastRedirectTime = useRef(0);
  const hasRedirected = useRef(false);
  const [maxRedirectsReached, setMaxRedirectsReached] = useState(false);

  const isDevBypassEnabled =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  /**
   * Reset the redirect counter whenever the user becomes authenticated.
   * This ensures a fresh budget after a successful login.
   */
  useEffect(() => {
    if (isAuthenticated) {
      redirectCount.current = 0;
      lastRedirectTime.current = 0;
      hasRedirected.current = false;
      setMaxRedirectsReached(false);
    }
  }, [isAuthenticated]);

  /**
   * Safely push to /login with loop-break and cooldown logic.
   */
  const safeRedirectToLogin = useCallback(() => {
    // Already on the login page — nothing to do
    if (pathname === '/login' || pathname === '/register') {
      return;
    }

    // Exceeded max consecutive redirects → assume a loop, bail out
    if (redirectCount.current >= MAX_REDIRECT_ATTEMPTS) {
      setMaxRedirectsReached(true);
      return;
    }

    // Cooldown: skip if we redirected too recently (race-condition guard)
    const now = Date.now();
    if (now - lastRedirectTime.current < REDIRECT_COOLDOWN_MS) {
      return;
    }

    redirectCount.current += 1;
    lastRedirectTime.current = now;
    hasRedirected.current = true;
    router.push('/login');
  }, [pathname, router]);

  /**
   * Core redirect effect — only fires when loading is complete and
   * the user is confirmed unauthenticated.
   */
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isDevBypassEnabled && !isSessionExpired) {
      safeRedirectToLogin();
    }
  }, [isAuthenticated, isLoading, isDevBypassEnabled, safeRedirectToLogin, isSessionExpired]);

  // --- Render logic ---

  // Dev bypass: skip all auth checks
  if (isDevBypassEnabled) {
    return <>{children}</>;
  }

  // Show session expired UI immediately when session is expired
  // This provides deterministic recovery without waiting for redirect loops
  if (isSessionExpired && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="rounded-full h-12 w-12 bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Session Expired
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Your session has expired. Please log in again to continue.
          </p>
          <button
            onClick={() => {
              window.location.href = '/login';
            }}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect loop detected — show a user-friendly error instead of looping
  // This is a fallback for cases not caught by isSessionExpired
  if (
    !isAuthenticated &&
    maxRedirectsReached
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="rounded-full h-12 w-12 bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Authentication Error
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Unable to verify your session. Please try logging in again.
          </p>
          <button
            onClick={() => {
              // Reset the loop counter so the user can try again
              redirectCount.current = 0;
              lastRedirectTime.current = 0;
              hasRedirected.current = false;
              setMaxRedirectsReached(false);
              window.location.href = '/login';
            }}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
