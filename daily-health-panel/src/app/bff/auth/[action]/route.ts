import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  apiBaseUrl,
  clearTokens,
  deviceInfo,
  REFRESH_COOKIE,
  refreshTokens,
  saveTokens,
} from "@/lib/server/session";
import type { AuthTokensResponse } from "@/shared-contracts/auth.contract";

/** Panel actions that create a session, and the API route behind each. */
const SESSION_ACTIONS: Record<string, string> = {
  login: "/auth/login",
  "login-otp": "/auth/login/otp",
  signup: "/auth/signup",
  "pin-reset": "/auth/pin/reset",
};

/**
 * POST /bff/auth/<login|login-otp|signup|pin-reset>: adds this browser's
 * device block, calls the API, and keeps the tokens in httpOnly cookies. The
 * browser only gets the user summary back.
 * POST /bff/auth/logout ends the session on the API and clears the cookies.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/bff/auth/[action]">,
): Promise<Response> {
  const { action } = await ctx.params;

  if (action === "logout") {
    const jar = await cookies();
    let accessToken = jar.get(ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (!accessToken && refreshToken) {
      accessToken = (await refreshTokens(refreshToken))?.accessToken;
    }
    if (accessToken) {
      // Revokes the session on the API, so the refresh token is dead too.
      await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }).catch(() => undefined);
    }
    await clearTokens();
    return new Response(null, { status: 204 });
  }

  const apiPath = SESSION_ACTIONS[action];
  if (!apiPath) {
    return Response.json(
      { code: "NOT_FOUND", message: "Unknown action", details: null },
      { status: 404 },
    );
  }
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const upstream = await fetch(`${apiBaseUrl()}${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, device: await deviceInfo() }),
    cache: "no-store",
  });
  const body = (await upstream.json().catch(() => null)) as
    | AuthTokensResponse
    | Record<string, unknown>
    | null;
  if (!upstream.ok || !body || !("accessToken" in body)) {
    return Response.json(body, { status: upstream.status });
  }
  const tokens = body as AuthTokensResponse;
  await saveTokens(tokens);
  return Response.json({ user: tokens.user }, { status: 200 });
}
