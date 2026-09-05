# ADR-0006: Web app architecture (Next.js App Router + BFF)

**Status:** accepted · 2026-09-04

- Next.js 16 App Router, React 19, Tailwind 4, strict TypeScript. Server components resolve the UI locale (cookie → Accept-Language) and set `<html lang dir>`; RTL is first-class (logical properties, `unicode-bidi: isolate` for technical tokens).
- All API access goes through `/api/bff/[...path]` (allow-listed methods/paths, same-origin check on mutations, httpOnly cookies). No API URL or token is exposed to the browser; `API_URL` is a server env var.
- Security headers: nosniff, DENY framing, strict referrer, Permissions-Policy limiting camera/microphone to self.
- shadcn/ui was **not** added yet: the v1 surface is small and hand-written accessible primitives avoid dependency inflation; adopt shadcn when component count justifies it.
