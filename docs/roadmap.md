# Taleem AI Roadmap

- [x] Phase 0: Initial Repository Setup
- [ ] Phase 1: Authentication & User Management
  - [x] Phase 1A: Firebase Project, Authentication & Admin SDK Wiring
  - [x] Phase 1B: Firestore Catalogue Schema & Seed Script
  - [x] Phase 1C: Dynamic Board / Class / Subject / Chapter Selectors
  - [x] Phase 1D: Public Catalogue Pages & Dynamic Routing
  - [x] Phase 1E: Admin Panel Shell & Admin Authorization
- [ ] Phase 2: Core Platform & Content Delivery
- [ ] Phase 3: AI Service Integration
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
