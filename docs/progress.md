# Taleem AI Progress Log

This document serves as a persistent record of the progress made across different phases of the Taleem AI project. 

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