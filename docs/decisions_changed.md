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
