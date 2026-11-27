import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import type { ServerEnv } from '@voxeli/config';

export interface AccessTokenClaims {
  sub: string;
  role: 'user' | 'admin';
  plan: 'free' | 'pro' | 'business';
  sid: string;
}

/**
 * Access tokens: short-lived HS256 JWTs. Refresh tokens: opaque random
 * strings; only their SHA-256 is persisted. Supports key rotation by
 * accepting the previous secret for verification only.
 */
export class TokenService {
  private readonly current: Uint8Array;
  private readonly previous: Uint8Array | null;

  constructor(
    private readonly env: Pick<
      ServerEnv,
      'JWT_SECRET' | 'JWT_PREVIOUS_SECRET' | 'JWT_ISSUER' | 'ACCESS_TOKEN_TTL_SECONDS'
    >,
  ) {
    this.current = new TextEncoder().encode(env.JWT_SECRET);
    this.previous = env.JWT_PREVIOUS_SECRET
      ? new TextEncoder().encode(env.JWT_PREVIOUS_SECRET)
      : null;
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.env.ACCESS_TOKEN_TTL_SECONDS * 1000);
    const token = await new SignJWT({ role: claims.role, plan: claims.plan, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience('voxeli-api')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.current);
    return { token, expiresAt };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const opts = { issuer: this.env.JWT_ISSUER, audience: 'voxeli-api', algorithms: ['HS256'] };
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.current, opts));
    } catch (e) {
      if (!this.previous) throw e;
      ({ payload } = await jwtVerify(token, this.previous, opts));
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw new Error('bad claims');
    const role = payload.role === 'admin' ? 'admin' : 'user';
    const plan = payload.plan === 'pro' || payload.plan === 'business' ? payload.plan : 'free';
    return { sub: payload.sub, role, plan, sid: payload.sid };
  }

  /**
   * Short-lived ticket for the realtime relay. Browsers cannot set headers on a
   * WebSocket handshake, so the connect credential travels in the query string;
   * it is therefore scoped to one session, one user, and ~60 seconds.
   */
  async signRelayTicket(
    claims: { sub: string; sid: string; plan: AccessTokenClaims['plan'] },
    ttlSeconds = 60,
  ): Promise<{ ticket: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const ticket = await new SignJWT({ sid: claims.sid, plan: claims.plan, typ: 'relay' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience('voxeli-relay')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.current);
    return { ticket, expiresAt };
  }

  async verifyRelayTicket(
    ticket: string,
  ): Promise<{ sub: string; sid: string; plan: AccessTokenClaims['plan'] }> {
    const { payload } = await jwtVerify(ticket, this.current, {
      issuer: this.env.JWT_ISSUER,
      audience: 'voxeli-relay',
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      payload.typ !== 'relay'
    ) {
      throw new Error('bad relay ticket');
    }
    const plan = payload.plan === 'pro' || payload.plan === 'business' ? payload.plan : 'free';
    return { sub: payload.sub, sid: payload.sid, plan };
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
