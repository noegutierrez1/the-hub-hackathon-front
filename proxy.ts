import { NextResponse, type NextRequest } from "next/server";

import { HUB_SESSION_COOKIE_NAME, verifyHubSessionToken } from "@/lib/auth/session";

const ADMIN_PAGE_PREFIXES = ["/admin", "/inventory", "/checkout"];
const STUDENT_PAGE_PREFIXES = ["/student", "/checkin"];
const ADMIN_API_PATHS = [
  "/api/analyze",
  "/api/cloudinary/upload",
  "/api/dataconnect/checkout",
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

function unauthorized(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method.toUpperCase();

  if (pathname === "/api/auth/session" || pathname === "/api/dataconnect/health") {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(HUB_SESSION_COOKIE_NAME)?.value || null;
  const session = await verifyHubSessionToken(sessionToken);
  const isApiRoute = pathname.startsWith("/api/");

  if (pathname === "/login" && session) {
    return NextResponse.redirect(
      new URL(session.role === "admin" ? "/admin" : "/student/inventory", request.url)
    );
  }

  const isAdminPage = startsWithAny(pathname, ADMIN_PAGE_PREFIXES);
  const isStudentPage = startsWithAny(pathname, STUDENT_PAGE_PREFIXES);

  if (!isApiRoute && isAdminPage) {
    if (!session) {
      return buildLoginRedirect(request);
    }

    if (session.role !== "admin") {
      return buildLoginRedirect(request);
    }
  }

  if (!isApiRoute && isStudentPage && !session) {
    return buildLoginRedirect(request);
  }

  if (isApiRoute && startsWithAny(pathname, ADMIN_API_PATHS)) {
    if (!session) {
      return unauthorized("Sign-in is required.", 401);
    }

    if (session.role !== "admin") {
      return unauthorized("Admin access is required.", 403);
    }
  }

  if (pathname === "/api/dataconnect/inventory-items") {
    // GET is public — guests can browse inventory without logging in
    if (["POST", "DELETE"].includes(method)) {
      if (!session) {
        return unauthorized("Sign-in is required.", 401);
      }

      if (session.role !== "admin") {
        return unauthorized("Admin access is required.", 403);
      }
    }
  }

  if (pathname === "/api/dataconnect/claim" && !session) {
    return unauthorized("Sign-in is required.", 401);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
