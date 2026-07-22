# Taleem AI - Key Decisions & Architectural Changes

This document logs significant architectural decisions and changes made throughout the development process. Future AI assistants and developers should consult this document to understand the "why" behind the codebase design.

## Phase 1B: Database Strategy
- **Decision:** Separate Public Catalogue from Private Analytics/Usage limits.
- **Change Details:** 
  - Firestore was designated exclusively as the single source of truth for public, read-heavy data (catalogue navigation, public site settings, academy settings).
  - Data that requires strict relational tracking or fast sequential updates (like AI daily limits and user token usage) will NOT be stored in Firestore to prevent excessive write costs and structure complexities. This data will be handled by Supabase (`usage_policies` table) later in Phase 4B.

## Phase 1B: Seeding Strategy
- **Decision:** Idempotency and Deterministic IDs.
- **Change Details:**
  - Instead of allowing Firestore to auto-generate random document IDs for the catalogue, we decided to use deterministic slug-based IDs (e.g., `punjab`, `class-9`, `physics`). 
  - This allows the seed script to be run repeatedly without duplicating data.
  - The script uses `set` with `{ merge: true }` so it only updates existing fields and leaves newly added production fields untouched, making it safe to run in a live production environment.

## Phase 1C: State Management & Data Fetching
- **Decision:** Use Zustand and a custom deduplication hook for catalogue selections.
- **Change Details:** 
  - Zustand was chosen to maintain the hierarchical selection state (`boardId`, `classId`, etc.) and automatically reset dependent children when a parent changes, ensuring a single global source of truth.
  - A custom `useCatalogueOptions` hook was built (instead of adding heavy libraries like SWR/React Query) to handle in-flight request deduplication, short-lived caching, and offline fallbacks (with an 8-second timeout to prevent infinite Firebase SDK hangs).

## Phase 1D: Server Caching & Data Fetching
- **Decision:** Use stable Next.js 16 Cache Components for Public Catalogue routes.
- **Change Details:**
  - Standardized on `cacheComponents: true` in `next.config.ts`.
  - Migrated away from unstable cache functions, using standard Next.js 16 native caching functions (`"use cache"`, `cacheLife`, `cacheTag`).
  - Required upgrading to Node.js 20.9+ and TypeScript 5.1+ to satisfy Next.js 16.
  - Required explicitly separating Firebase Admin logic into `lib/firestore/catalogue.server.ts` to ensure it only runs server-side and integrates perfectly with `use cache`.

## Phase 1E: Admin Panel Shell & Authorization
- **Decision:** Custom Claims over Firestore Documents for admin roles.
- **Change Details:**
  - Avoided the `isAdmin: true` document field approach to eliminate database read costs and speed up authorization checks.
  - Implemented Firebase Custom Claims (`admin: true`) which are baked into the ID token/session cookie and verifiable instantly without database access.
  - Implemented the double-submit CSRF token pattern to securely issue `__session` cookies for Server Components, avoiding direct client-side session vulnerabilities.
  - Adapted `layout.tsx` Server Component to wrap cookie usage within `<Suspense>` to natively support Next.js 16's Partial Prerendering (`cacheComponents`) without breaking static builds.
  - Configured optimistic Next.js 16 `proxy.ts` middleware for fast route rejection without loading heavy Firebase Admin instances on edge.

## Phase 2A: Resource Storage Strategy
- **Decision:** Google Drive Service Account vs Firebase Storage.
- **Change Details:**
  - Standardized on a centralized Google Drive model over Firebase Storage to leverage Drive's native unmetered outbound bandwidth and explicit organizational ownership, as decided in `docs/storage.md`.
  - Service Account handles upload natively, generating static `webContentLink` properties to serve content directly, mitigating egress cost bottlenecks.

## Phase 2B: Upload Integrity & Validation
- **Decision:** Upload Transactions Database Selection.
- **Change Details:**
  - Firebase Firestore is chosen explicitly for `upload_transactions` because the Postgres/Supabase instance is not slated until Phase 3A. Firestore supports the required strict atomic capabilities using a `.create()` method against deterministic Document IDs.
- **Decision:** PDF Buffering Deviation for Parser Integrity.
- **Change Details:**
  - Pure byte-by-byte streaming metadata parsing for PDFs risks missed corruption/encryption headers. `pdfjs-dist` natively supports partial range-based reads (`PDFDataRangeTransport`), but fails inside backend ESM environments with strict worker-thread boundaries.
  - To maintain maximum strict validation against corrupt, encrypted, or spoofed payloads, we standardized on using `pdf-lib` within an isolated Node Worker. This requires loading the stream into a `Buffer`.
  - To mitigate DoS and memory exhaustions from this deviation, a hard **50MB size limit** is rigidly enforced at the `busboy` streaming pipeline layer. Oversized files are rejected and unlinked *before* entering the parsing buffer.
- **Decision:** OAuth2 User Authentication Mode for Personal Google Drive Accounts.
- **Change Details:**
  - Standard Service Accounts lack storage quotas on personal Google accounts (@gmail.com) and cannot own personal My Drive files without Workspace Shared Drives.
  - Implemented `GOOGLE_DRIVE_AUTH_MODE=oauth_user` using `google.auth.OAuth2` with `GOOGLE_DRIVE_REFRESH_TOKEN` alongside Workspace `shared_drive` and `delegated` modes.
  - Created automated CLI authorization tool `npm run drive:authorize` to handle one-time authorization and automatic creation of the target `"Taleem AI Content"` folder in personal My Drive.

## Pre-Phase 2C: Catalogue Hierarchy & Paper Metadata Amendment
- **Decision:** Unified Mutation API and Arbitrary Tree Hierarchy (`parentNodeId`).
- **Change Details:**
  - Extended existing `chapters` collection with `parentNodeId: string | null` rather than renaming to "content node", preserving Firestore collection stability and API backwards compatibility.
  - Extended existing `catalogueService` and `catalogueRepository` with `validateNodeParentage` rather than creating a parallel mutation pipeline. All creation and reparenting enforces:
    1. Parent node exists under exact same `boardId`/`classId`/`subjectId`.
    2. Self-parenting (`nodeId === parentNodeId`) is forbidden.
    3. Ancestor cycles (`A -> B -> C -> A`) are detected recursively and rejected.
- **Decision:** Regional Examination Boards and Past Paper Metadata.
- **Change Details:**
  - Added new `boards/{boardId}/examinationBoards/{id}` catalogue collection, populated for Punjab multi-board regional entities (`lhr`, `rwp`, `guj`, `mtn`, etc.) and Federal (`fbise`). Managed via `catalogueService`.
  - Added past paper metadata fields (`examinationBoardId`, `paperYear`, `paperSession`, `paperType`) on `Resource` and `PublicResourceDto`.
  - Added explicit code warning regarding the conceptual overlap between `paperType` (e.g. "old", "new") and `curriculumVersion` so submitters use `curriculumVersion` for syllabus revisions.
- **Decision:** Bounded 2-Read Notes Tree & 1-Read Past Papers Queries.
- **Change Details:**
  - `getSubjectNotesTree` performs exactly 2 Firestore queries (1 for content nodes, 1 for published resources) regardless of depth or size, executing in-memory parent-child mapping and bottom-up `hasContentInSubtree` pruning.
  - `getSubjectPastPapersGrouped` performs exactly 1 Firestore query and groups in-memory by `examinationBoardId -> paperYear -> paperSession/paperType`.
- **Decision:** Deferring Admin Tree Management UI to Module 7.
- **Change Details:**
  - The backend admin catalogue mutation API (`/api/admin/catalogue`, `catalogueService`) is fully operational. Front-end admin UI screens for content node management and examination board management are explicitly deferred to Module 7 (Admin Completeness & Operations).

