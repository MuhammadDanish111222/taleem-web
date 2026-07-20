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
