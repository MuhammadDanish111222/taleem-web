# Architecture

The Taleem AI platform is divided into two primary repositories to enforce a clear separation of concerns and maintain security boundaries:

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
