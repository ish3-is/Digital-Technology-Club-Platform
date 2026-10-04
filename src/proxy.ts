import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content Security Policy nonce.
 *
 * Next.js stamps the nonce it finds in the `x-nonce` request header onto the
 * inline bootstrap scripts it generates, so the policy can allow exactly those
 * and keep every other inline script blocked. The value is generated per
 * request and never reused across responses.
 *
 * This runs in the Node.js runtime rather than the edge runtime so the nonce
 * can be generated with `crypto`, which the policy depends on being unique.
 */
export const config = {
  matcher: [
    // Everything except static assets and image optimisation output.
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};

const isDev = process.env.NODE_ENV !== "production";

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  // `strict-dynamic` lets a nonce-bearing script load further modules without
  // the policy having to enumerate them.
  const csp = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // The development overlay evaluates generated code; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  // Next.js extracts the nonce from the request's own CSP header and stamps it
  // on the bootstrap scripts it generates. Both headers are needed: the
  // response one goes to the browser, the request one drives the renderer.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}