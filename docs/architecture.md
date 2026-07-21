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
