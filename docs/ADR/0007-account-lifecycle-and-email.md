# ADR-0007: Account lifecycle (verification, reset, deletion, export) and email delivery

**Status:** accepted · 2026-09-06

## Decision

- **Tokens** for email verification (24 h) and password reset (1 h) are 32 random bytes, stored only as SHA-256 in `auth_tokens`, single-use (`consumed_at`), and consumed atomically with `UPDATE … WHERE unconsumed AND unexpired RETURNING`.
- **No account enumeration**: reset requests return `202` with an identical body whether or not the email exists; only the audit log records the outcome.
- **Password reset revokes every session** and voids other outstanding reset tokens.
- **Deletion deletes**: the `users` row is removed and cascades take settings, subscription, sessions, tokens, quotas, translations and realtime sessions. `ai_usage.user_id` is set to `NULL` so cost accounting survives without identity. The audit event stores a truncated hash of the id, not the id.
- **Export** returns one JSON document with everything held (profile, settings, plan, translations, realtime session metadata, active sessions) and states explicitly that no audio exists.
- **Email** goes through an `EmailProvider` adapter. `console` (dev/test) is refused in production by env validation; `resend` calls the documented HTTP endpoint with an `Idempotency-Key` per logical event so retries never double-send. Templates exist in all seven UI locales; links stay LTR on their own line.
- Registration sends the verification email best-effort: delivery failure is logged, never surfaced as a registration failure.

## Options considered

An email SDK (rejected: one endpoint, no need for a dependency); SMTP via nodemailer (deferred: adds a dependency and credentials handling; the adapter boundary makes it a drop-in later); soft-delete only (rejected: the spec requires deletion to actually delete).

## Consequences

- `userProfile.emailVerified` is exposed so clients can nudge, but nothing is gated on it yet; gating (e.g. cloud history requires a verified email) is a product decision for later.
- The web app needs `/verify-email` and `/reset-password` pages (added with this ADR) because the links point at `APP_BASE_URL`.
