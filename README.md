# Taleem AI Web

Next.js 16 App Router web application, student platform, and admin portal (`taleem-web`).

## System Features
- **Public & Admin Interfaces**: Dynamic catalogue selector, server-rendered catalogue pages, published-only resource reader, HTTP range-aware PDF proxy (`/api/content/[resourceId]/preview`), attachment downloader (`/api/content/[resourceId]/download`), and scoped search engine.
- **Admin Ingestion BFF (Phase 3C)**: Secure admin endpoint (`POST /api/admin/ingest/jsonl`) validating admin sessions, constructing job payloads, signing 60-second RS256 internal JWTs, and forwarding ingestion requests to `taleem-ai-service`.
- **Local RAG Admin (Phases 3D–3F)**: Local-only corpus QA, named draft retrieval, structured expected-question and visual edits, durable job status, controlled Drive image previews, and audited corpus activation/rollback.
- **Internal Security & Auth**: Cross-repository RS256 asymmetric JWT signing (`signInternalJwt.ts`), double-submit CSRF cookie protection (`__csrf`), and browser isolation of backend secrets.
- **Module 4 Single Ask**: Public `/ai/ask` provides typed-English board/class/subject/chapter selection, `short|long` mode, one cancellable in-flight request, idempotent retry, Pakistan-time usage, safe equations, and distinct approved/textbook-grounded/General AI states.
- **Module 4 Local Administration**: Prompt history/drafts/tests/activation/rollback, generated-candidate review, approved-bank revisions/variations/visuals/import, and retention preview are available only when `ADMIN_PANEL_ENABLED=true`.
- **Module 5 Run 1 (dark)**: a separate same-origin Multiple Ask BFF contract carries immutable curriculum scope into private direct uploads and durable validation jobs; it has no UI, OCR, or answers and is disabled by default. See [`docs/module5_run1_multiple_ask.md`](docs/module5_run1_multiple_ask.md).

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Start development server
npm run dev

# 4. Execute test suites and typecheck
npm run test:unit
npm run test:rules
npm run typecheck
```

## Project Status
Please refer to [docs/roadmap.md](file:///d:/AI%20Learning/BEST%20WISHES/Taleem%20AI/taleem_ai/taleem-web/docs/roadmap.md) and [docs/progress.md](file:///d:/AI%20Learning/BEST WISHES/Taleem AI/taleem_ai/taleem-web/docs/progress.md) for detailed phase logs.

## Admin deployment gate

Set `ADMIN_PANEL_ENABLED=true` only on a local developer laptop. Set `ADMIN_PANEL_ENABLED=false` on Vercel; local RAG administration and its visual proxy return 404 before admin authentication, Firebase Admin, internal JWT signing, parsing, or AI-service calls are reached. Public routes remain available.

See [`docs/deployment_runbook.md`](docs/deployment_runbook.md) for the Module 4 environment boundary and staging checklist. Module 4 is complete: real configuration, deployment, staging, CI, and the public WhatsApp support setting were verified.

