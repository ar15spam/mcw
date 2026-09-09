import crypto from "node:crypto";

/**
 * Short-lived signed tokens that let the Rust realtime backend trust a
 * browser's identity and project access without talking to Postgres.
 *
 * Next.js is the only party that can mint one: it checks the Better Auth
 * session and the project membership, then signs {user, project, role}.
 * The Rust server verifies the HMAC + expiry and reads identity from the
 * payload. The same REALTIME_SHARED_SECRET must be set on both deployments.
 *
 * Token format (compact, url-safe):  base64url(payloadJson).base64url(hmacSha256)
 */

const TOKEN_TTL_SECONDS = 300;

export type RealtimeRole = "owner" | "editor";

export type RealtimeClaims = {
  sub: string; // Better Auth user id
  name: string; // display name shown in presence
  image: string | null; // avatar url, optional
  pid: string; // project id this token is valid for
  role: RealtimeRole;
  iat: number; // issued-at (unix seconds)
  exp: number; // expiry (unix seconds)
};

function secret(): string {
  const value = process.env.REALTIME_SHARED_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "REALTIME_SHARED_SECRET is not configured (min 16 chars). Set it on Vercel and Railway.",
    );
  }
  return value;
}

export function realtimeSecretConfigured(): boolean {
  const value = process.env.REALTIME_SHARED_SECRET;
  return Boolean(value && value.length >= 16);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(payloadB64)
    .digest("base64url");
}

export function mintRealtimeToken(input: {
  userId: string;
  name: string;
  image?: string | null;
  projectId: string;
  role: RealtimeRole;
}): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const claims: RealtimeClaims = {
    sub: input.userId,
    name: input.name.slice(0, 60) || "Producer",
    image: input.image ?? null,
    pid: input.projectId,
    role: input.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const payloadB64 = b64url(JSON.stringify(claims));
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return { token, expiresAt: claims.exp * 1000 };
}

/** Verify a token. Returns claims when valid and unexpired, otherwise null. */
export function verifyRealtimeToken(token: string): RealtimeClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as RealtimeClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
