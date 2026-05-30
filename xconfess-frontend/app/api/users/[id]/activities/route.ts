import { internalProxyErrorResponse } from "@/app/lib/utils/proxyError";
import { getApiBaseUrl } from "@/app/lib/config";

const BASE_API_URL = getApiBaseUrl();

export async function GET(request: Request, { params }: { params: { id: string } }) {

  try {
    const { id } = params;
    const backendUrl = `${BASE_API_URL}/users/${id}/activities`;

    const correlationId = request.headers.get("X-Correlation-ID") || "unknown";

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "X-Correlation-ID": correlationId,
      },
    });

    const responseBody = await response.text();
    const status = response.status;

    return new Response(responseBody, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return internalProxyErrorResponse({ route: "GET /api/users/[id]/activities" }, error);
  }
}
