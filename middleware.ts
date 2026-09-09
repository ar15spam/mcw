import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth gate. This only checks for the presence of a session cookie
 * (no database round-trip); every API route and server action still validates
 * the session properly. Its job is purely to avoid rendering the dashboard or
 * studio shell to someone who is obviously logged out, and to remember where
 * they were headed.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  if (sessionCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/studio/:path*"],
};
