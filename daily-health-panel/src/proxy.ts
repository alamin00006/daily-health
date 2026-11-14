import { NextResponse, type NextRequest } from "next/server";

/** Same names as lib/server/session.ts (proxy runs separately; no shared imports). */
const REFRESH_COOKIE = "ds_refresh";
const AUTH_PAGES = ["/login", "/signup", "/reset-pin"];

/**
 * Sends people without a session to the login page, and logged-in people
 * away from it. Only checks that the cookie exists; the API decides whether
 * the session is valid (an invalid one ends up back here after a 401).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const loggedIn = request.cookies.has(REFRESH_COOKIE);
  const onAuthPage = AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );

  if (!loggedIn && !onAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (loggedIn && onAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Pages only: not the BFF routes, Next internals or static files.
    "/((?!bff|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|webp|ico)$).*)",
  ],
};
