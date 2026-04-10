/**
 * JWT Authentication for Affiliate Portal
 *
 * Completely separate from Shopify session auth.
 * Affiliates are NOT Shopify users — they access a standalone portal.
 *
 * JWTs are issued on login, stored client-side, and verified server-side.
 */

import jwt from "jsonwebtoken";
import { createCookieSessionStorage, redirect } from "react-router";

interface JWTPayload {
  affiliateId: string;
  shopId: string;
  email: string;
}

function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Sign a JWT token for an authenticated affiliate
 * @returns JWT token string (expires in 7 days)
 */
export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJWTSecret(), {
    expiresIn: "7d",
    issuer: "afflowindia",
    audience: "affiliate-portal",
  });
}

/**
 * Verify and decode a JWT token
 * @returns Decoded payload or null if invalid/expired
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJWTSecret(), {
      issuer: "afflowindia",
      audience: "affiliate-portal",
    });
    return decoded as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Extract JWT token from Authorization header
 * Expects: "Bearer <token>"
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Authenticate a request from the affiliate portal
 * Extracts and verifies the JWT from the Authorization header
 * @returns The decoded payload or throws an error
 */
export function authenticatePortalRequest(request: Request): JWTPayload {
  const token = extractToken(request);
  if (!token) {
    throw new Response("Unauthorized: No token provided", { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    throw new Response("Unauthorized: Invalid or expired token", {
      status: 401,
    });
  }

  return payload;
}

// Cookie-based session storage for Affiliate Portal (independent of Shopify App Bridge)
export const affiliateSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__affiliate_session",
    httpOnly: true,
    path: "/portal",
    sameSite: "lax",
    secrets: [process.env.JWT_SECRET || "default_local_secret"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function createAffiliateSession(
  affiliateId: string,
  shopDomain: string
) {
  const session = await affiliateSessionStorage.getSession();
  session.set("affiliateId", affiliateId);
  session.set("shopDomain", shopDomain);
  
  return new Headers({
    "Set-Cookie": await affiliateSessionStorage.commitSession(session, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }),
  });
}

export async function getAffiliateSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  const session = await affiliateSessionStorage.getSession(cookie);
  const affiliateId = session.get("affiliateId");
  const shopDomain = session.get("shopDomain");

  return affiliateId && shopDomain ? { affiliateId, shopDomain } : null;
}

export async function requireAffiliateAuth(request: Request) {
  const session = await getAffiliateSession(request);
  if (!session) {
    throw redirect("/portal/login");
  }
  return session;
}

export async function isAffiliateAuthed(request: Request): Promise<boolean> {
  const session = await getAffiliateSession(request);
  return session !== null;
}

export async function destroyAffiliateSession(request: Request) {
  const session = await affiliateSessionStorage.getSession(
    request.headers.get("Cookie")
  );
  return redirect("/portal/login", {
    headers: {
      "Set-Cookie": await affiliateSessionStorage.destroySession(session),
    },
  });
}
