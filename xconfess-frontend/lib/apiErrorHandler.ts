/**
 * Centralized API error formatting and normalization.
 * Standardizes error responses across all App Router proxy handlers.
 */

export interface ApiErrorResponse {
  message: string;
  status: number;
  correlationId?: string;
}

/**
 * Normalizes backend and proxy errors into a consistent JSON shape.
 * 
 * @param error - The caught error or error data
 * @param context - Optional context like correlationId and default status
 * @returns A normalized ApiErrorResponse object
 */
export function normalizeApiError(
  error: any,
  context: { 
    correlationId?: string; 
    status?: number;
    fallbackMessage?: string;
  } = {}
): ApiErrorResponse {
  const status = error?.status || error?.backendStatus || context.status || 500;
  const correlationId = error?.correlationId || (context.correlationId !== "unknown" ? context.correlationId : undefined);
  
  let message = context.fallbackMessage || "An unexpected error occurred";

  if (typeof error === 'string') {
    message = error;
  } else if (error?.message) {
    message = error.message;
  } else if (error?.error) {
    message = typeof error.error === 'string' ? error.error : (error.error.message || message);
  }

  // Structured logging for developers
  // We avoid repeated console.error in route handlers by doing it here once
  console.error(`[API Error] status=${status} cid=${correlationId || 'none'} message="${message}"`, {
    originalError: error
  });

  return {
    message,
    status,
    correlationId
  };
}

/**
 * Creates a standard JSON Response for API errors.
 */
export function createApiErrorResponse(
  error: any,
  context: { 
    correlationId?: string; 
    status?: number;
    fallbackMessage?: string;
    route?: string;
  } = {}
): Response {
  const normalized = normalizeApiError(error, context);
  
  // If route is provided, we can add it to the log for better traceability
  if (context.route) {
    console.debug(`[${context.route}] Error response generated`);
  }

  return new Response(JSON.stringify(normalized), {
    status: normalized.status,
    headers: { "Content-Type": "application/json" },
  });
}
