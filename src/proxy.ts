import { NextResponse, type NextRequest } from "next/server";

/** Basic auth for the professor/admin area. Username is ignored; password = ADMIN_PASSWORD. */
export function proxy(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return new NextResponse("Set ADMIN_PASSWORD in .env.local", { status: 500 });
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Class Catch-up admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
