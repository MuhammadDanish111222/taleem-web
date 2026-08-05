# Taleem AI Progress Log

## Module 4 — Structured long-answer rendering

- The public Ask renderer now supports validated level-2/level-3 headings and semantic bullet lists in addition to paragraphs, equations, citations, and protected visuals. Existing stored paragraph answers remain compatible.
- Complete verification passes: `296` web tests with one intentionally gated skip, ESLint, TypeScript, the Next.js production build, client-bundle secret scan, and diff checks.

This document serves as a persistent record of the progress made across different phases of the Taleem AI project. 

## Module 4 — Ask a Question, Run 2 staging delivery

- **Status:** Student and local-admin implementation, real service integration, deployment, source-labelled staging, and CI pass. The Module 4 exit gate remains open only for the owner's public WhatsApp support setting.
- **Student Ask:** `/ai/ask` reuses the catalogue hierarchy, accepts typed English text only, offers short/long modes with internal `exam_style`, generates operation UUIDs correctly, keeps one cancellable request in flight, prevents stale replacement, loads usage once, updates it from responses, and never polls.
- **Rendering:** Approved, textbook-grounded, and the exact “General AI answer — not verified from your selected textbook.” states are distinct. Validated structured blocks preserve equation and reviewed-visual positions. Raw HTML and arbitrary URLs are disabled; visuals use the protected same-origin route.
- **Local administration:** Prompt history/draft/edit/test/activate/rollback, candidate filters/inspection/approve/reject/retention preview, and approved-bank create/import/history/archive/variation/embedding/visual-link operations reuse the existing local-only security boundary.
- **Browser evidence:** With the admin gate disabled, public admin pages return 404. With the local gate enabled, six default prompts loaded, retention preview returned zero, an admin-authored disposable approved revision was created, and a later exact student Ask reused it with the approved label, one quota reservation, and zero provider attempts. Anonymous requests consumed five reservations and the sixth was blocked with the required owner-directed message.
- **Local verification:** The merged focused Ask/admin suite passed `57` tests. The complete Firestore-emulator-aware suite passed `276` tests with one intentionally gated live Google Drive smoke test skipped. Lint, typecheck, the production build with `ADMIN_PANEL_ENABLED=false`, public-admin 404 checks, and the browser-bundle secret scan passed.
- **Boundary hardening:** A fresh `56`-test focused run verifies typed-English enforcement at the BFF, complete operation-required admin contracts, literal same-Origin scheme/host/port checks, and prompt-selection invalidation when key/mode/scope changes. Lint, typecheck, production build, bundle scan, and `git diff --check` passed again.
- **Real staging:** The Vercel BFF successfully returned a cited `syllabus_grounded` answer, the exact General AI warning with zero citations/visuals, and an audited exact `approved_bank` answer with zero provider attempts. Anonymous usage returned the configured 5/day state through the Redis-backed service path. Temporary Firebase Auth staging identities were deleted immediately after each scenario.
- **Deployment and CI:** The public Vercel Ask page is live and the latest web CI run `30638671011` is green. Railway deployment `5a64df3f-87a0-46b8-a03a-3d2404d89164` is healthy; service CI run `30993218596` is also green.
- **Support setting:** Real Firestore currently has no `academy_settings/default` document. The WhatsApp action therefore remains safely hidden. No number or message has been invented.
- **Remaining exit work:** The owner must provide the public WhatsApp number and default message so `academy_settings/default` can be created and the limit-exceeded action can be verified. No Module 4 completion claim is made before that input.

## Module 4 — Ask a Question, Run 1 of 2

- **Status:** Public BFF and final typed contracts implemented and verified; Module 4 is not complete.
- **Implemented:** Same-origin JSON-only Ask/usage routes, Firebase bearer verification, one trusted profile read, account-tier internal claim, explicit camel/snake mapping, strict response validation, stable sanitized errors, no-store caching, canonical `AI_SERVICE_INTERNAL_URL`, and expanded client-bundle leak scanning.
- **Verification:** Focused BFF/auth tests passed (`18`), real HTTP BFF-to-FastAPI tests passed (`2`), the complete emulator-aware web suite passed (`230` with one intentionally gated live Drive smoke test skipped), and lint, typecheck, production build, and bundle scan passed.
- **Run 2:** Build the student Ask experience and local-only prompt/candidate/bank admin interfaces, configure real service secrets, deploy/stage, and complete final documentation. Run 1 performed no deployment, real paid provider call, commit, or push.

## Phase 0: Initial Setup
- **Status:** Completed
- **Details:** Initialized a Next.js 14+ App Router project. Configured TailwindCSS, TypeScript, and basic repository structures for the web application (`taleem-web`).

## Phase 1A: Firebase & Auth Foundations
- **Status:** Completed
- **Details:** 
  - Created and wired the Firebase Project (`taleemai-70c36`).
  - Configured Firebase Client SDK (`lib/firebase/client.ts`).
  - Configured Firebase Admin SDK (`lib/firebase/admin.ts`).
  - Set up environment variables and verified server-side/client-side separation.

## Phase 1B: Firestore Catalogue & Seeding
- **Status:** Completed
- **Details:** 
  - Designed strictly typed schema for public catalogue (`boards/{board_id}/classes/{class_id}/subjects/{subject_id}/chapters/{chapter_id}`).
  - Created robust, idempotent database seeding script (`scripts/seed-catalogue.ts`) to populate Punjab and Federal board hierarchies using stable slugs.
  - Authored and deployed Firestore Security Rules (`firestore.rules`) to securely expose public data and restrict unauthorized writes.
  - Authored and deployed Firestore Composite Indexes (`firestore.indexes.json`) to allow sorted queries by `display_order`.

## Phase 1C: Dynamic Board / Class / Subject / Chapter Selectors
- **Status:** Completed
- **Details:** 
  - Implemented reusable `useCatalogueSelection` Zustand store to manage the hierarchical state (board -> class -> subject -> chapter).
  - Ensured cascading resets: changing a parent automatically clears all dependent children selections.
  - Implemented `useCatalogueOptions` hook to deduplicate simultaneous requests, prevent stale-response race conditions, cache briefly, and support retry logic.
  - Built accessible native select components (`BoardSelector`, `ClassSelector`, `SubjectSelector`, `ChapterSelector`) that map 'All Chapters' to `null` properly and expose distinct loading, empty, and error states.

## Phase 1D: Public Catalogue Pages & Dynamic Routing
- **Status:** Completed
- **Details:** 
  - Upgraded Next.js to 16.x stable release and enabled `cacheComponents: true` in `next.config.ts`.
  - Built typed server-side catalogue functions (`lib/firestore/catalogue.server.ts`) using Firebase Admin SDK and native Next.js 16 caching (`use cache`, `cacheLife`, `cacheTag`).
  - Developed a dynamic `/[boardId]/[classId]/[subjectId]` route that validates exact Firestore hierarchy and throws a 404 for invalid/inactive combinations.
  - Implemented client-side `CatalogueHero` utilizing existing Phase 1C Zustand selectors for exact route navigation.
  - Created a skeleton `loading.tsx` to ensure smooth UX during route navigation without performing client data fetches.

## Phase 1E: Admin Panel Shell & Admin Authorization
- **Status:** Completed
- **Details:** 
  - Established secure Firebase admin session flow incorporating double-submit CSRF protection (`__csrf`).
  - Built `/api/auth/session` endpoint to exchange ID tokens for `__session` cookies strictly for users with `admin: true` claims.
  - Built `/api/auth/logout` endpoint that revokes all refresh tokens on the Firebase server for deep security.
  - Developed server-side session utilities (`lib/auth/session.ts`) to extract and verify cookies using the Firebase Admin SDK.
  - Implemented Next.js 16 `proxy.ts` for an optimistic cookie presence check without Firebase Admin instantiation on edge/proxy.
  - Refactored `app/admin/(protected)/layout.tsx` to wrap `requireAdminSession` in a `<Suspense>` boundary to correctly handle Next.js 16 `cacheComponents` (PPR) dynamic requirements.
  - Configured `tsconfig.json` to properly resolve `@/*` path aliases.
  - Created standalone operator CLI script (`scripts/grant-admin.ts`) using Node 20 `--env-file` to safely append `admin: true` claims to user accounts.

## Phase 1F: Admin Catalogue CRUD
- **Status:** Completed
- **Details:**
  - Designed strict discriminated union schemas in `lib/validation/catalogue.ts` using `z.union`. These strictly reject forbidden fields (`active`, `display_order`, `path`) and ensure `slug` immutability during updates.
  - Built typed `lib/repositories/firestore/catalogueRepository.ts` to strictly encapsulate path construction and expose only atomic Firestore operations (transactions and batched writes).
  - Built `lib/services/admin/catalogueService.ts` which successfully enforces parent existence, generates sequential `display_order`, assigns default active status, and runs reorder validations.
  - Reused `__csrf` double-submit protections and `requireAdminSession()` server-side validations in `app/api/admin/catalogue/route.ts` to authorize POST/PATCH operations.
  - Configured `vitest.config.ts` to run automated verification for validation payloads and reorder atomic failure cases.
  - Verified that `icon` is currently a documented part of the `Subject` schema.
- **Verification Performed:**
  - **Duplicate Slug (409):** Tested database collision prevention via Firestore transactions during creation.
  - **Immutable ID Rejection:** Schema enforces dropping/disabling `slug` mutation on update payloads.
  - **Invalid Parent (404):** Checked and throws `DomainError` via `assertParentExists` if parent hierarchy is invalid.
  - **Unauthenticated (401) & Non-admin (403):** Session cookie and custom claim checks enforced natively by Phase 1E helpers.
  - **CSRF & Origin Rejection:** Verified exact match against `__csrf` cookie and `X-CSRF-Token` header.
  - **Inactive-record Visibility:** Verified `getFullAdminTree` correctly queries independent of the `active: true` constraint.
  - **Server-controlled fields:** Tested schema rejections if client submits `display_order`, `active`, or `created_at` on creation.
  - **Atomic reorder failure cases:** Covered with Vitest suites (length mismatch, duplicates, foreign IDs throw strictly before any Firestore update is executed).

## Phase 2A: Resource Schema, Versions and Storage Provider
- **Status:** Completed
- **Details:**
  - Implemented immutable resource and version schema (book, note, past_paper).
  - Created strictly typed server-only Firestore repositories for resources, versions, and admin audit logs.
  - Centralized resource status transitions (draft -> published -> hidden -> archived) with exact hierarchy revalidation.
  - Designed provider-neutral storage interface exposing stream-based uploads and authorized range reads.
  - Implemented Google Drive provider supporting Shared Drives and Domain-Wide Delegation.
  - Restricted all direct client reads/writes via strict Firestore rules.
  - Added exhaustive Firestore emulator and integration tests.

## Phase 2B: Secure Upload, Validation, OAuth2 Personal/Workspace Drive Storage, and Publishing Workflow
- **Status:** Completed
- **Details:**
  - Developed stream-aware multipart upload parser (`lib/security/multipartUpload.ts`) with chunk magic bytes inspection (`%PDF-`), strict payload limits (50MB max file size, 20 fields max), and safe stream ownership.
  - Implemented Worker Thread PDF validation (`lib/security/pdfValidation.ts` & `pdfParserWorker.js`) using `pdf-lib` to inspect PDF structure, page count limits (500 pages max), and encrypted PDF rejection (`PDF_ENCRYPTED`).
  - Built state machine `UploadService` managing `UploadTransaction` states (`pending` ➔ `uploaded` ➔ `committed` / `failed` / `cleanup_required`) with HMAC-SHA256 idempotency key replay and automatic Drive compensation cleanup for interrupted uploads.
  - Supported `GOOGLE_DRIVE_AUTH_MODE=oauth_user` mode using `google.auth.OAuth2` for personal My Drive accounts alongside `shared_drive` and `delegated` modes.
  - Created one-time CLI authorization tool `npm run drive:authorize` (`scripts/authorizeDrive.ts`) to automate OAuth consent, token exchange, and automatic creation of the target `"Taleem AI Content"` folder in personal Google Drive.
  - Added automated seeding route `/api/test-upload/seed` and UI test page `/test-upload` with live Firestore document inspection.
  - Enforced strict production 404 gating via `proxy.ts` for all `/test-*` routes in production.
  - Verified 100% pass across unit test suite (52 tests) and real Firestore Emulator integration suite (40 tests including `scripts/manual-test-phase2b.test.ts`).

## Phase 2C: Content Browsing, Published-Only Reader & Range-Aware PDF Proxy
- **Status:** Completed
- **Details:**
  - Implemented flat server-rendered content browser pages (`/books`, `/notes`, `/past-papers`) driven by search parameters.
  - Built interactive shared client component (`ContentBrowser.tsx`) supporting hierarchy selectors, past-paper query options (`examinationBoardId`, `paperYear`, `paperSession`, `paperType`), and cursor-based pagination.
  - Built published-only paginated list API (`/api/content/route.ts`) extending `listPublicResources` with past paper filters and `ResourceError("VALIDATION_FAILED")` handling.
  - Developed HTTP byte-range inline PDF proxy (`/api/content/[resourceId]/preview/route.ts`) supporting `200 OK`, `206 Partial Content` (standard, suffix, and clamped out-of-bounds `end`), malformed range syntax fallback, `416 Unsatisfiable`, `304 Not Modified` via ETag (`version.sha256`), and `404` status gating on hidden/draft/archived resources.
  - Developed attachment download route (`/api/content/[resourceId]/download/route.ts`) setting RFC 5987 safe filename headers and rechecking live publication status.
  - Built published-only PDF reader shell page (`/content/[resourceId]/page.tsx`) and client component (`PdfReader.tsx`) using self-hosted pdf.js web worker (`public/pdf.worker.min.mjs`).
  - Implemented security headers (`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-cache, must-revalidate`, and restrictive path-scoped CSP `default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none';`).
  - Defined composite indexes in `firestore.indexes.json` for past paper queries.
- **Verification Performed:**
  - **Unit Tests:** `npm run test:unit` passed 100% (75 tests across 16 files including 12 dedicated `tests/api/contentRoutes.test.ts` tests).
  - **Rules & Emulator Integration:** `npm run test:rules` passed 100% (91 tests across 5 files including `resourceService.test.ts` past-paper filtering, DTO verification, and pagination stability).
  - **Typecheck:** `npm run typecheck` passed cleanly with 0 TypeScript errors.
  - **Client Bundle Scan:** `npm run scan:bundle` passed with 0 provider leakage issues in client JS bundles.

## Phase 2D: Launch Search with Explicit Limits
- **Status:** Completed
- **Details:**
  - Built token normalization module (`lib/search/normalize.ts`) supporting lowercasing, NFKD Unicode diacritic stripping, punctuation removal, token length filtering ($\ge 2$), token capping (max 30 tokens/title), prefix generation (length 2..12 + exact full token), and schema version constant (`CURRENT_SEARCH_SCHEMA_VERSION = 1`).
  - Built scoped search engine (`lib/search/resourceSearch.ts`) enforcing hierarchy validation (`boardId` + `classId` required, optional `subjectId` + `type`), zero-token query short-circuiting (`"!?"` $\to$ `{ data: [] }`), primary token selection (longest token), candidate fetching (`orderBy("displayOrder", "asc")`, limit 50), in-memory token AND verification, and deterministic ranking (exact match count $\to$ prefix match count $\to$ `displayOrder` $\to$ `id`).
  - Built public search API endpoint (`app/api/content/search/route.ts`) returning Zod-validated `PublicResourceDto[]` payloads and error responses (`422`, `404`).
  - Integrated debounced (300ms) search input into client component `ContentBrowser.tsx` passing active `type` and `subjectId` context server-side.
  - Built idempotent CLI backfill script (`scripts/backfill-resource-search.ts` / `npm run search:backfill`) updating outdated/missing search fields in batched writes.
  - Defined 4 explicit composite indexes in `firestore.indexes.json` covering search queries with `searchPrefixes` array-contains and `displayOrder` sorting.
- **Verification Performed:**
  - **Unit Tests:** `npm run test:unit` passed 100% (85 tests across 18 test files including `normalize.test.ts` and `resourceSearch.test.ts`).
  - **Rules & Emulator Integration:** `npm run test:rules` passed 100% (55 tests across 7 files including `resourceSearch.emulator.test.ts` and `backfill.emulator.test.ts`).
  - **Typecheck:** `npm run typecheck` passed cleanly with 0 TypeScript errors across 3 consecutive runs.

## Phase 3B: Cross-Repository Internal JWT Signer & API Helper
- **Status:** Completed
- **Details:**
  - Implemented `lib/internalAuth/signInternalJwt.ts` minting short-lived RS256 internal JWTs with 60-second TTL and claims: `uid`, `admin`, `feature`, `request_id`, `jti`, `iat`, `exp`, `aud` (`taleem-ai-service`), `iss` (`taleem-web`). Generates fresh `jti` UUID v4 per call.
  - Implemented `lib/internalApi/callAiService.ts` as the central BFF-to-AI-service helper attaching internal authorization headers, propagating request context, and mapping AI service error responses into structured errors.
  - Verified private key `INTERNAL_JWT_PRIVATE_KEY` resides strictly in server-side environment variables and is unreachable from client bundles.
  - Built CLI token signer script (`scripts/sign_token_cli.ts`) for cross-repository end-to-end integration testing.
- **Verification Performed:**
  - `tests/internalAuth.test.ts` verifying RS256 signing, claims, JTI uniqueness, 60s TTL, and missing key error handling.
  - `tests/callAiService.test.ts` verifying Authorization header attachment, request propagation, and error handling.
  - `npm run test:unit`, `npm run lint`, `npm run build` executed cleanly.

## Phase 3C (v1-scoped): Admin JSONL Chunk Ingestion BFF Endpoint
- **Status:** Completed
- **Details:**
  - Built `app/api/admin/ingest/jsonl/route.ts` BFF API route accepting admin uploaded JSONL chunk files.
  - Enforces local-only admin gate via `isAdminPanelEnabled()` check returning `404 Not Found` when `ADMIN_PANEL_ENABLED=false`.
  - Enforces CSRF token verification via `validateAdminWriteRequest()`.
  - Validates active admin session using `requireAdminSession()`.
  - Rejects missing, empty, or non-string `jsonl_content` with status `400 Bad Request`.
  - Forwards requests to `taleem-ai-service` via `callAiService('/api/v1/internal/ingest/jsonl', 'POST', payload, session.uid, session.admin, 'jsonl_ingest')`, signing an internal RS256 JWT.
  - Returns `202 Accepted` response with AI service job metadata (`job_id`, `status: "queued"`, `idempotency_key`).
- **Verification Performed:**
  - Automated tests (`tests/api/adminJsonlIngest.test.ts`, `tests/proxy.adminPanel.test.ts`, `tests/security/adminWrite.test.ts`) verifying route security, request parsing order, CSRF token validation, 404 gate behavior, and JWT forwarding.
  - Pull Request #2 merged into `main` (`e62e7ca`).
  - Executed full GitHub Actions CI run on `main` (`30124721819`) with 100% green pass rate across unit tests, Firestore emulator tests, lint, typecheck, production build, and cross-repo HTTP tests.

## Phase 3D: Embeddings and Corpus Completeness

- **Status:** Completed
- **Details:** The service embeds chunks and individual expected questions with pinned, L2-normalized BGE `vector(768)` values. Per-row provenance, input hashes, counters, and readiness checks prevent incomplete or mismatched vectors from becoming `qa_ready`.
- **Deployment:** Bulk ingestion and embedding work is owned by the local-admin worker. Railway-public owns no durable bulk jobs.

## Phase 3E: Scoped Retrieval

- **Status:** Completed
- **Details:** Internal RAG retrieval uses SQL-scoped dense chunk, expected-question, and lexical channels. It deduplicates expected-question matches to parent chunks, fuses rank-only results deterministically, and returns safe citations and evidence strength without raw scores or vectors.

## Phase 3F: Local Admin QA, Editing, and Activation

- **Status:** Completed
- **Details:** The local admin panel supports structured corpus inspection, job status, named-version QA, draft-only expected-question and visual editing, audit viewing, QA approval, activation, and rollback. Visuals remain Google Drive assets; only approved title/description metadata affects the parent chunk embedding.
- **Security:** RAG administration and image preview are gated locally before authentication, parsing, or internal service calls. Writes require an admin session, Origin, CSRF, and a signed internal admin JWT. Browser responses never include vectors, Drive keys, provider details, or direct URLs.
- **Verification:** Fresh PostgreSQL 17 + pgvector migrations, scoped Supabase rollback integration tests, the complete `105`-test service suite, and the emulator-aware `55`-test web suite passed.

## Phase 3F extension: Paired JSONL + Visual Extracts DOCX Import

- **Status:** Completed.
- **Details:** Added the protected local-admin paired chapter importer. It validates external JSONL visual associations against Visual Extracts DOCX metadata cards, resolves and crops Word images, uploads only referenced cropped visuals privately to Google Drive, enriches JSONL internally, and queues the existing local-only JSONL/embedding pipeline. Unused DOCX visuals are reported without upload; imported visuals remain `pending` review with `llm_decide` as their eventual display policy.
- **Safety:** The route is unavailable on Vercel, requires the existing admin/session/Origin/CSRF/JWT controls, and never exposes or audits Drive IDs/keys/URLs, uploaded bytes, source JSONL, or enriched JSONL. No paid LLM/OCR/vision API is involved. A matching active Firebase board/class/subject/chapter is an explicit precondition for a real import.
- **Verification:** Controlled parser/BFF/Drive tests (`35`), TypeScript typecheck, and read-only preflight of the supplied Chemistry pair (nine visual cards) passed. No educational data was uploaded, queued, activated, or added to Firestore during verification.

## Student user profiles and subscription administration

- **Status:** Completed.
- **Details:** Added explicit first-visit Anonymous/Google choice, private `users/{uid}` Firestore profiles, a single server-controlled `subscriptionActive` field, and `/admin/users` listing/toggle controls. No chat history collection exists.
- **Cost control:** Profile synchronization is deduplicated per browser-tab session and performs no update for an unchanged existing profile.
- **Security:** Direct Firestore profile reads and writes are denied. Self-profile creation requires a verified Firebase ID token; subscription changes require an admin session, Origin and CSRF validation, and generate an audit record.
- **Verification:** Focused authentication/API tests passed (`11`), user-service emulator tests passed (`3`), Firestore rule tests passed (`13`), TypeScript typecheck passed, and lint reported no new errors.

## Post-Module 3 platform hardening

- **Status:** Completed.
- **Admin content:** `/admin/content` provides catalogue dropdowns, bounded private PDF upload, draft review, publish/hide/archive/restore controls, and immutable version history. Local textbook uploads support PDFs up to 150 MiB; clear file-size and draft/publication feedback prevents silent failures.
- **Student content:** Books, notes, and past papers are linked from the homepage, filtered by active catalogue scope, and available through protected online reading and download routes only while published.
- **Cost and speed:** Catalogue queries, published content lists, title search, published reader/version resolution, and active RAG version configuration use bounded shared caches. Content mutations invalidate narrow Next.js tags immediately; RAG activation/rollback invalidates the hashed Redis scope key after commit. Student profile synchronization is at most once per user per tab session and unchanged profiles are not rewritten.
- **RAG operations:** Paired imports detect identical in-progress/succeeded chapter submissions, reuse content-addressed Drive visuals, automatically use an editable corpus snapshot, and provide a preview-first cleanup for importer-owned visuals that are unreferenced and older than 24 hours.
- **Live verification:** Real Firebase contains the active Punjab catalogue, student profiles, and a published Chemistry book. Its Google Drive PDF is available through byte-range preview. Real Supabase retains one complete active Punjab/9/Chemistry corpus with 19/19 chunk embeddings and 94/94 expected-question embeddings.

