# Architecture

The Taleem AI platform is divided into two primary repositories to enforce a clear separation of concerns and maintain security boundaries:

## Module 4 Run 1: Public Ask BFF

- The browser uses only same-origin `POST /api/ai/ask` and `GET /api/ai/usage`. Ask requires a Firebase bearer token, exact same Origin, JSON content type, a client UUID, bounded typed text, `short|long`, and `exam_style`; multipart, attachments, file/image/PDF fields, encoded payloads, `mcq`, and `mixed` are rejected before service work.
- One direct `users/{uid}` profile read derives the trusted `anonymous|google|premium` tier. The browser cannot submit provider or subscription state. The short-lived internal JWT aligns `request_id` and carries only the required validated tier.
- Browser camelCase is mapped explicitly to the Python snake_case contract. Responses map safe blocks, citations, visual metadata, prompt/corpus/revision provenance, usage/reset state, terminal status, and stable errors; no vectors, scores, confidence, prompts, provider secrets, Drive data, or internal URL is exposed.
- `AI_SERVICE_INTERNAL_URL` is the sole server-only service location. The stale Railway variable is retired. Production bundle scanning checks internal URL/private-key/provider-key names and configured values in client artifacts.
- Module 4 has no student chat history, file upload, image input, OCR, or polling. The Run 2 UI loads usage once and updates it from Ask responses.

## Module 4 Run 2: Student and local-admin surfaces

- `/ai/ask` is a typed-English Single Ask form using existing active catalogue selectors. It creates a UUID for a deliberate new submission, keeps that UUID for a retry of the same operation, allows only one in-flight request, supports cancellation, and rejects stale completion state.
- Usage loads once on page entry and is updated from every success or quota response, with no polling. Reset time is displayed in Pakistan time. Anonymous and Google exhaustion use the exact owner-directed message; the optional WhatsApp action is built only from public `academy_settings/default` values and a properly encoded `wa.me` URL.
- Answer rendering is source-aware: approved revisions are labelled as reviewed bank content; grounded answers retain validated citations and reviewed visuals in structured block positions; General AI displays exactly “General AI answer — not verified from your selected textbook.” and cannot render textbook citations or visuals.
- The client never infers source from prose or retrieval rank. It renders only the validated `answerSource` returned by the BFF; the service requires a verified retrieved citation for `syllabus_grounded`, while reference-free fallback content is `general_knowledge` or an honest `no_answer`.
- Text and Markdown are rendered without raw HTML. KaTeX uses safe settings, and visual content is fetched only through the same-origin protected `/api/ai/visual/[visualId]` route. Provider URLs, Drive identifiers, storage keys, and internal service locations never enter the browser contract.
- Local Module 4 administration reuses the existing admin session, claim, Origin, CSRF, signed internal admin JWT, server-only service URL, and audit boundary. One gated BFF supports prompt management, candidate review/retention preview, and approved-bank authoring/import/history/archive/variations/visual links. With `ADMIN_PANEL_ENABLED=false`, both pages and BFF return 404 before authentication or service work.
- Module 4 exposes neither Multiple Ask nor OCR/file ingestion. These remain later-module concerns.

## 1. taleem-web (Frontend & Web Backend)
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **Responsibilities:**
  - Hosts the public marketing site, student web application, and protected admin panel.
  - Route handlers act as a BFF (Backend for Frontend), validating requests securely using Zod before calling into the service layer.
  - Contains **no** core business logic.

## 2. taleem-ai-service (AI Backend)
- **Framework:** FastAPI
- **Language:** Python >= 3.11
- **Deployment:** Railway
- **Responsibilities:**
  - Hosts the highly trusted AI backend logic.
  - Manages vector embeddings, retrieval-augmented generation (RAG), and interacts securely with DeepSeek.
  - Provides strict Pydantic v2 schemas for all API payloads and configurations.

## Trust Boundaries & Authentication
- **Browser:** Never communicates directly with `taleem-ai-service`.
- **BFF (Next.js API routes):** Handles authentication using Firebase (Client/Admin).
- **Internal JWT Contract:** Communication between `taleem-web` (BFF) and `taleem-ai-service` happens strictly via a short-lived Internal JWT.
  - The JWT is signed asymmetrically (RS256) by `taleem-web` using `INTERNAL_JWT_PRIVATE_KEY`.
  - The JWT is verified by `taleem-ai-service` using the public key from `INTERNAL_JWT_PUBLIC_KEYS_JSON`.
  - Replay protection is enforced by storing consumed JTIs in Redis with a 60-second TTL.

## Environment Ownership
Strict separation of secrets is enforced:

**`taleem-web` Owns:**
- `FIREBASE_*` (Client API keys and Admin service accounts)
- `INTERNAL_JWT_PRIVATE_KEY` / `INTERNAL_JWT_KEY_ID`
- `AI_SERVICE_INTERNAL_URL`
*(No Supabase or AI provider keys are allowed here)*

**`taleem-ai-service` Owns:**
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DEEPSEEK_API_KEY` & `OCR_KEYS`
- `INTERNAL_JWT_PUBLIC_KEYS_JSON`

## Storage & Resources
- **Storage Provider:** Google Workspace Shared Drive (used for PDF storage).
- **Resource Versioning:** Immutable version control via Firestore.
- **Admin Upload Boundary:** Local-admin uploads accept validated PDFs up to 150 MiB. Multipart parsing streams to a temporary file before private Drive upload; public deployments do not expose the admin upload surface.
- **Publication Cache:** Published resource lists and published reader/version lookups use shared Next.js caches with narrow scope/resource tags. Publish, hide, archive, restore, and version mutations invalidate the relevant tags immediately.
- **Student Delivery:** Only published resources are returned to students. PDF preview and download remain same-origin proxies with byte-range support, conditional caching, and no Drive identifier or URL in the browser.
- **Trust Boundary:** Browser never directly accesses Google Drive URLs. It goes through Next.js proxy routes using authorized streams.

## 5. Admin Ingestion BFF Flow (Phase 3C)
- **Endpoint:** `POST /api/admin/ingest/jsonl`
- **Security:** Requires valid admin session (`requireAdminSession`).
- **Validation:** Validates non-empty `jsonl_content` string payload.
- **Forwarding:** Invokes `callAiService('/api/v1/internal/ingest/jsonl', 'POST', payload, session.uid, session.admin, 'jsonl_ingest')`, signing an asymmetric RS256 internal JWT (`aud: "taleem-ai-service"`, 60s TTL) and returning `202 Accepted` with `job_id` and queued status.

## 6. RAG Retrieval and Local Administration (Phases 3D–3F)

- **Embedding and retrieval:** `taleem-ai-service` owns pinned BGE embeddings, completeness gating, and SQL-scoped dense, expected-question, and lexical retrieval. The browser receives only safe retrieval evidence through authenticated BFF calls.
- **Local admin boundary:** RAG QA, draft editing, activation, rollback, job inspection, and visual preview exist only when `ADMIN_PANEL_ENABLED=true` on the owner’s laptop. On public Vercel deployments the relevant BFF routes return 404 before session, parsing, or internal-service work.
- **Write protection:** Local mutations require Firebase admin authorization, same-origin validation, CSRF validation, and a signed internal JWT with `admin=true`. The FastAPI service repeats authorization independently.
- **Visuals:** JSONL chunk visuals are stored as server-side metadata linked to the corpus. The BFF resolves an authorized visual stream reference only after scope validation and streams allowlisted images from Google Drive; Drive keys and direct Drive URLs never reach the browser.
- **Activation:** Active corpus versions are immutable. The local panel creates a draft, runs named-version QA, records approval, and activates or rolls back through one locked, audited database transaction. Railway-public owns no durable bulk ingestion or embedding jobs.

## 7. Paired Chapter Import (Phase 3F extension)

- **Local-only route:** `POST /api/admin/rag/paired-import` is gated by `ADMIN_PANEL_ENABLED` before session access or multipart parsing. It then requires the existing Firebase admin session, same-origin validation, CSRF token, and signed internal JWT calls. Public Vercel receives no upload surface.
- **Inputs and validation:** The operator supplies an external chapter JSONL and matching Visual Extracts DOCX. The external JSONL never contains `content_type`, Drive links, or storage keys. The DOCX parser walks Word document order, requires each metadata card to map to its following drawing, resolves its relationship, applies `a:srcRect`, and requires exact normalized ID/title/description matches selected by JSONL.
- **Private assets:** Only referenced allowlisted PNG/JPEG/WebP/GIF visuals are cropped and uploaded to the configured private Drive folder. Content-addressed Drive app properties make retries idempotent; a known enqueue failure deletes only objects created in that attempt. Browser DTOs, errors, audit state, and retrieval never contain Drive IDs, keys, URLs, source bytes, or enriched JSONL.
- **Normal pipeline:** The BFF creates enriched JSONL only in server memory (`content_type: explanation` and server-only keys), then calls the existing protected JSONL ingestion endpoint. Visuals remain `pending` review with `llm_decide` as their eventual display policy; no corpus is auto-activated. The matching Firebase board/class/subject/chapter must already exist and be active. This workflow uses no paid LLM, OCR, image-generation, or vision API.

## 8. Student Identity and Subscription

- Firebase Authentication is the identity authority. A first-time public visitor explicitly chooses Google or anonymous sign-in; the application no longer silently creates an anonymous account.
- Firestore stores one private `users/{uid}` profile containing identity display fields and the single `subscriptionActive` boolean. No chat history is stored.
- The browser cannot read or write `users` directly. A verified Firebase bearer-token BFF creates the profile once and otherwise writes only if Firebase identity fields changed.
- Admin user listing and subscription changes use the protected admin session. Subscription writes require same-origin and CSRF validation and are recorded in the existing admin audit log.
- The browser performs at most one profile synchronization per user per tab session. Existing unchanged profiles cause a Firestore read but no write.

## 9. Recovery Boundaries

- Drive stores bytes while Firestore/Supabase store references; deleting a Drive object leaves metadata but makes preview/download fail. Restore from Drive Trash when available or re-upload the source PDF/DOCX.
- Firestore catalogue/resource/profile deletion is not repaired from Supabase. Catalogue administration uses activation toggles instead of destructive delete; independent exports are still required for disaster recovery.
- Supabase corpus versions provide application rollback, but they are not a substitute for a database backup if rows are manually deleted. Database administration must use least-privilege access and periodic logical backups.
