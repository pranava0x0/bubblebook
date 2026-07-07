import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PREFIXES = ["/login", "/auth"];

// Any redirect must carry the refreshed session cookies from supabaseResponse,
// or the session silently fails to persist.
function redirectWithCookies(from: NextResponse, request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // API routes check auth themselves and return JSON errors, not redirects.
  if (pathname.startsWith("/api")) {
    return supabaseResponse;
  }

  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!user && !isPublic) {
    return redirectWithCookies(supabaseResponse, request, "/login");
  }
  if (user && pathname === "/login") {
    return redirectWithCookies(supabaseResponse, request, "/bookshelf");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
