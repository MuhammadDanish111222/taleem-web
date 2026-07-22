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

## Phase 2C: Content Browsing, Published-Only Reader & Byte-Range PDF Proxy
- **Decision:** Byte-Range Proxy and Server-side Authorization Streaming.
- **Change Details:**
  - `Content-Disposition: inline` is served for preview routes and `attachment` for download routes.
  - The proxy handles HTTP `Range` headers natively (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`), clamping out-of-bounds `end` values to `version.sizeBytes - 1`, and returning `206 Partial Content`.
  - Malformed Range syntax falls back to `200 OK` full file serving. Unsatisfiable ranges (`start >= version.sizeBytes`) return `416 Range Not Satisfiable`.
- **Decision:** Cache-Control Strategy for Conditional Revalidation (ETag / 304).
- **Change Details:**
  - Responses set `Cache-Control: private, no-cache, must-revalidate` alongside `ETag: "${version.sha256}"`.
  - Using `no-cache` instead of `no-store` enables browser conditional request caching (`If-None-Match`), allowing `304 Not Modified` responses while enforcing live publication status checks on every single request.
- **Decision:** Restrictive Reader Content Security Policy & Self-Hosted PDF.js Worker.
- **Change Details:**
  - Path-scoped security headers for `/content/*` enforce `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none';`.
  - Self-hosted PDF.js web worker bundle (`public/pdf.worker.min.mjs`) is used directly without external CDN dependencies.
- **Decision:** Server-Side Past-Paper Filtering via Firestore Index Merging.
- **Change Details:**
  - `listPublicResources` filters past paper criteria (`examinationBoardId`, `paperYear`, `paperSession`, `paperType`) directly inside the Firestore query as `.where()` clauses using [Firestore's index merging feature](https://firebase.google.com/docs/firestore/query-data/index-overview).
  - This supersedes the earlier in-memory bounded candidate loop (`MAX_CANDIDATE_BATCHES_PER_REQUEST`), maximizing read-cost efficiency on Firestore's free tier by avoiding unnecessary candidate reads.
  - Four narrow single-field + sort composite indexes (`examinationBoardId`, `paperYear`, `paperSession`, `paperType` paired with `displayOrder`) allow Firestore to dynamically merge indexes at query time for any filter combination without requiring a multi-field composite index per combination.
- **Decision:** Deferred Server-Side Caching for Content List Endpoint (`DEFERRED`).
- **Change Details:**
  - The content list endpoint (`/api/content`, `listPublicResources`) currently executes a live Firestore read per request.
  - **Future Optimization:** Apply the same server-side, shared cache pattern used for public catalogue pages in Phase 1D — Next.js `"use cache"` + `cacheTag` on the list query, invalidated via `revalidateTag()` from `resourceService.ts` (`publishResource`, `hideResource`, `archiveResource`, `addResourceVersion`) after transactions commit, tagged narrowly (e.g. per board+class+subject+type).
  - **Reason for Deferral:** There is no production traffic yet, the Firestore index-merging fix directly resolves main read costs, and a shared server-side cache (benefiting all users) is a far stronger lever than a per-browser client cache. Revisit once production Firebase console telemetry identifies this endpoint as a significant share of daily read volume.

## Phase 2D: Launch Search with Explicit Limits
- **Decision:** Dormant Title Edit Hook Pattern.
- **Change Details:**
  - `computeSearchFields(title: string, schemaVersion?: number)` is exported from `lib/search/normalize.ts` and invoked during resource creation (`createDraftResourceWithInitialVersion`).
  - There is currently no title-edit mutation API in the codebase (title editing is Module 7 scope). Whoever builds the future title-edit endpoint must call `computeSearchFields` to update `searchTokens` and `searchPrefixes`.
- **Decision:** Selective Primary Token Candidate Query & Deterministic Server-Side Ranking.
- **Change Details:**
  - Firestore does not support multiple `array-contains` clauses per query. Multiword input selects the longest normalized token for the primary `.where("searchPrefixes", "array-contains", primaryToken).orderBy("displayOrder", "asc").limit(50)` query.
  - Verified candidates (passing in-memory AND verification across all tokens) are ranked deterministically:
    1. Exact token match count (descending)
    2. Prefix match count (descending)
    3. `displayOrder` (ascending)
    4. Document `id` (ascending)
- **Decision:** Server-Side Context Narrowing (`subjectId` and `type`).
- **Change Details:**
  - Optional `subjectId` and `type` parameters are accepted by `searchPublicResources` and applied as server-side `.where()` clauses in Firestore *before* `.orderBy()` and `.limit()`.
  - This prevents client-side post-slicing truncation where valid results for a specific type (e.g. `/books`) are dropped because out-of-context notes/past papers outranked them in an unscoped query.
  - Four explicit composite indexes are declared in `firestore.indexes.json` covering `searchPrefixes` combined with `boardId`, `classId`, `status`, optional `subjectId`, optional `type`, and `displayOrder`, adhering to Firestore guidelines against relying on index-merging for `array-contains` queries.
- **Decision:** Bounded Prefix Generation & 12-Character Prefix Cap Behavior.
- **Change Details:**
  - Single-character tokens (< 2 chars) are excluded from indexing.
  - Prefixes are generated for token lengths 2 up to 12 characters, plus the full exact token if longer than 12 characters.
  - **Quirk:** A partial query token between 13 characters and full length will not match stored prefixes until the user types the complete token (which matches the exact stored token).
- **Decision:** Capped Candidate Window Best-Effort Sampling Behavior.
- **Change Details:**
  - Search results represent a best-effort sample of the top 50 candidates (by `displayOrder`) matching the primary token before AND verification.
  - In narrow multiword queries, genuine matching resources whose primary token falls outside the top 50 `displayOrder` window will not be returned.
- **Decision:** Deferred Request Rate Limiting (`DEFERRED`).
- **Change Details:**
  - Abuse rate-limiting is explicitly deferred to Module 8 (Security Hardening) as the application has no Redis/Postgres rate-limiter infrastructure today. Input query length limits (q: 2..100 chars, limit: 1..50) are strictly enforced via Zod.
- **Decision:** Shared Schema Version Constant Placement.
- **Change Details:**
  - `CURRENT_SEARCH_SCHEMA_VERSION = 1` is exported from `lib/search/normalize.ts` and stored on `Resource.searchSchemaVersion`. The idempotent CLI script `scripts/backfill-resource-search.ts` compares against this constant to detect and migrate outdated documents.
- **Decision:** Documented Engine Upgrade Triggers.
- **Change Details:**
  - The Firestore `array-contains` prefix design is optimized for launch scale (< 100,000 resources, Roman/English script titles).
  - Migration triggers to a dedicated search engine (Typesense, Meilisearch, Algolia, or Postgres `tsvector`):
    1. Corpus volume exceeds 50,000 resources or index storage limits impact costs.
    2. Requirement for full-text fuzzy/typo-tolerant matching (e.g. Levenshtein distance).
    3. Requirement for Urdu/Nasta'liq bilingual tokenization or stemming (Snowball/Hunspell).
    4. Search requirement spanning non-title fields (descriptions, tags, OCR page content).



