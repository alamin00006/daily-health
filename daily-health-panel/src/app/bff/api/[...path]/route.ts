import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  apiBaseUrl,
  clearTokens,
  REFRESH_COOKIE,
  refreshTokens,
  saveTokens,
} from "@/lib/server/session";

/**
 * Forwards /bff/api/<path> to the API with the access token from the
 * httpOnly cookie, refreshing it once when it has expired. Request bodies
 * (JSON or multipart uploads) and query strings pass through unchanged.
 */
async function forward(
  request: NextRequest,
  ctx: RouteContext<"/bff/api/[...path]">,
): Promise<Response> {
  const { path } = await ctx.params;
  if (path.some((part) => part === ".." || part.includes("\\"))) {
    return Response.json(
      { code: "BAD_REQUEST", message: "Bad path", details: null },
      { status: 400 },
    );
  }
  const jar = await cookies();
  let access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;

  // The body can be read once; keep it for a retry after refreshing.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  const target = `${apiBaseUrl()}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const send = (token: string | undefined) => {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("accept", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const requestId = request.headers.get("x-request-id");
    if (requestId) headers.set("x-request-id", requestId);
    return fetch(target, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  };

  if (!access && refresh) {
    const tokens = await refreshTokens(refresh);
    if (tokens) {
      await saveTokens(tokens);
      access = tokens.accessToken;
    }
  }

  let upstream = await send(access);
  if (upstream.status === 401 && refresh) {
    const error = (await upstream.clone().json().catch(() => null)) as {
      code?: string;
    } | null;
    if (error?.code === "ACCESS_TOKEN_EXPIRED" || !access) {
      const tokens = await refreshTokens(refresh);
      if (tokens) {
        await saveTokens(tokens);
        upstream = await send(tokens.accessToken);
      } else {
        await clearTokens();
      }
    }
  }
  if (upstream.status === 401) await clearTokens();

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
