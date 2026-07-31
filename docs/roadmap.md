# Taleem AI Roadmap

## Module 4: Ask a Question

- [x] Run 1: public Ask/usage BFF, trusted identity/tier propagation, final typed contracts, production build and security verification.
- [ ] Run 2 exit gate: the student Ask UI, local-only prompt/candidate/question-bank interfaces, and disposable-stack verification are complete. Real configuration, staging, deployment, push, and green CI remain required before this item may be checked.

- [x] Phase 0: Initial Repository Setup
- [x] Phase 1: Authentication & User Management
  - [x] Phase 1A: Firebase Project, Authentication & Admin SDK Wiring
  - [x] Phase 1B: Firestore Catalogue Schema & Seed Script
  - [x] Phase 1C: Dynamic Board / Class / Subject / Chapter Selectors
  - [x] Phase 1D: Public Catalogue Pages & Dynamic Routing
  - [x] Phase 1E: Admin Panel Shell & Admin Authorization
- [x] Phase 2: Core Platform & Content Delivery
  - [x] Phase 2A: Resource Schema and Storage Provider
  - [x] Phase 2B: Secure Upload, Validation, OAuth2 Personal/Workspace Drive Storage, and Publishing Workflow
  - [x] Phase 2C: Content Browsing, Published-Only Reader & Byte-Range PDF Proxy
  - [x] Phase 2D: Launch Search with Explicit Limits
- [x] Phase 3: AI Service Integration
  - [x] Phase 3B: Cross-Repository Internal Auth & Durable Worker Runtime (Internal JWT Signer & Helper)
  - [x] Phase 3C (v1-scoped): Admin JSONL Chunk Ingestion & Validation
  - [x] Phase 3D: Pinned BGE embeddings and completeness checks for chunks and individual expected questions.
  - [x] Phase 3E: SQL-scoped dense, expected-question, and lexical retrieval with deterministic rank-only fusion.
  - [x] Phase 3F: Local-only RAG QA, draft editing, controlled visual previews, transactional activation, and rollback.
  - [x] Phase 3F extension: Local-only paired JSONL + Visual Extracts DOCX chapter import with private Drive visuals and existing ingestion jobs.
- [ ] Phase 4: Student Dashboard & Progress Tracking
- [ ] Phase 5: Admin Panel
- [ ] Phase 6: Assessments & Quizzes
- [ ] Phase 7: Payment & Subscription Integration
- [ ] Phase 8A: Analytics & Reporting
- [ ] Phase 8B: Gamification
- [ ] Phase 8C: Offline Support
- [ ] Phase 8D: Notifications
- [ ] Phase 8E: Performance Optimization
- [ ] Phase 8F: Final Polish & Launch

## CI Workflow & Testing Strategy
- **taleem-web**: GitHub Actions CI runs on `main` and PRs. It performs `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test` (Vitest), and `npm run build`.
- **taleem-ai-service**: GitHub Actions CI runs on `main` and PRs. It performs `uv sync`, `ruff check .`, `ruff format --check .`, `python -m compileall app`, `pytest`, and a startup smoke test `smoke_test.py`.
- **Module 1 Compliance**: Ensure both repositories pass all checks before proceeding to Module 2.

## Admin deployment setting

- Local laptop: `ADMIN_PANEL_ENABLED=true`
- Vercel: `ADMIN_PANEL_ENABLED=false`
- Railway continues to host the AI API. Bulk ingestion and embedding jobs are local-admin-only; Railway-public owns no durable bulk jobs. The browser remains limited to same-origin Next.js BFF routes.

## Updated: Module 2 - Phase 2A Resource Schema and Storage Provider
- Added resource versioning in Firestore.
- Configured Google Drive Storage Provider.

## Module 7 (Admin Completeness & Operations)
- Admin UI for catalogue content-node management (create/rename/reparent/deactivate nodes, manage examination boards) — backend mutation API (`catalogueService`, `validateNodeParentage`) is fully implemented; seed script and API route are the interim management mechanisms.
