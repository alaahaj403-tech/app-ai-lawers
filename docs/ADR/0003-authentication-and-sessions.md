# ADR-0003: Authentication, sessions and web token handling

**Status:** accepted · 2026-09-04

## Decision

- Email + password with **argon2id** (m=19456 KiB, t=2, p=1). Unknown-email logins verify against a dummy hash so timing does not reveal account existence; both failures return the same message.
- **Access token:** HS256 JWT, 15 min, issuer/audience pinned, `JWT_PREVIOUS_SECRET` supported for rotation.
- **Refresh token:** opaque 48-byte random, stored as SHA-256 only, **rotated on every refresh**, revocable per session (logout) and bound to a `sessions` row (device name, UA, expiry).
- **Mobile:** tokens in Keychain/Keystore (`flutter_secure_storage`), single-flight refresh on 401.
- **Web:** a BFF route (`/api/bff/*`) keeps both tokens in `httpOnly; SameSite=Strict` cookies and forwards an allow-listed set of API paths. Mutating requests must carry a same-host `Origin`/`Referer`. Browser JavaScript never sees a token.
- Authorization is per-route (`requireUser`, `requireAdmin`) **and** per-query (owner filter). Audit events are written for register, login (success/fail) and every admin flag change.

## Not yet

Email verification, password reset, OAuth/Apple/Google sign-in, MFA — tracked in `docs/TECH_DEBT.md`; the schema already has `email_verified_at`.
