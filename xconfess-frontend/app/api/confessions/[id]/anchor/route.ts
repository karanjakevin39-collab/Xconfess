import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

const BASE_API_URL = getApiBaseUrl();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { stellarTxHash } = body;

    if (!stellarTxHash) {
      return createApiErrorResponse("Stellar transaction hash is required", { status: 400 });
    }

    // Validate transaction hash format (64 hex characters)
    if (!/^[a-fA-F0-9]{64}$/.test(stellarTxHash)) {
      return createApiErrorResponse("Invalid Stellar transaction hash format", { status: 400 });
    }

    const backendUrl = `${BASE_API_URL}/confessions/${id}/anchor`;

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stellarTxHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return createApiErrorResponse(errorData, {
          status: response.status,
          fallbackMessage: `Failed to anchor confession: ${response.statusText}`,
          route: "POST /api/confessions/[id]/anchor"
        });
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (fetchError) {
      // Demo mode fallback
      const isDemoMode =
        process.env.NODE_ENV === "development" ||
        process.env.DEMO_MODE === "true";

      if (isDemoMode) {
        return new Response(
          JSON.stringify({
            id,
            stellarTxHash,
            isAnchored: true,
            anchoredAt: new Date().toISOString(),
            stellarExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${stellarTxHash}`,
            _demo: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Demo-Mode": "true",
            },
          }
        );
      }

      return createApiErrorResponse(fetchError, {
        status: 503,
        fallbackMessage: "Backend service unreachable",
        route: "POST /api/confessions/[id]/anchor"
      });
    }
  } catch (error) {
    return createApiErrorResponse(error, {
      status: 500,
      route: "POST /api/confessions/[id]/anchor"
    });
  }
}

