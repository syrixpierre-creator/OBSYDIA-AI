import { NextResponse, type NextRequest } from "next/server";

/** Fast edge guard: private areas require a session cookie. Full verification (DB + role) happens server-side in layouts and handlers. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("isms_session")?.value);
  if (!hasSession && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
