# Taleem AI Web

Next.js 16 App Router web application, student platform, and admin portal (`taleem-web`).

## System Features
- **Public & Admin Interfaces**: Dynamic catalogue selector, server-rendered catalogue pages, published-only resource reader, HTTP range-aware PDF proxy (`/api/content/[resourceId]/preview`), attachment downloader (`/api/content/[resourceId]/download`), and scoped search engine.
- **Admin Ingestion BFF (Phase 3C)**: Secure admin endpoint (`POST /api/admin/ingest/jsonl`) validating admin sessions, constructing job payloads, signing 60-second RS256 internal JWTs, and forwarding ingestion requests to `taleem-ai-service`.
- **Internal Security & Auth**: Cross-repository RS256 asymmetric JWT signing (`signInternalJwt.ts`), double-submit CSRF cookie protection (`__csrf`), and browser isolation of backend secrets.

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

