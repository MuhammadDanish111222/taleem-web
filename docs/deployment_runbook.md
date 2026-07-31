# Module 4 Web Deployment Runbook

## Vercel boundary

Set `ADMIN_PANEL_ENABLED=false`. Configure only public Firebase client values with `NEXT_PUBLIC_`. Keep Firebase Admin credentials, `AI_SERVICE_INTERNAL_URL`, `INTERNAL_JWT_PRIVATE_KEY`, and `INTERNAL_JWT_KEY_ID` server-only.

Do not configure a Supabase service-role key, DeepSeek key, Redis secret, internal Railway URL, or private JWT key as a public variable. The browser must call only same-origin Next.js routes.

## Owner-local boundary

Set `ADMIN_PANEL_ENABLED=true` only on the trusted local machine. Use the existing local admin session and claim, same-Origin checks, CSRF, internal JWT signer, and server-only AI service URL. The owner-local AI worker may use `WORKER_MODE=local_admin`; public Railway may not.

The optional public support action reads Firestore document `academy_settings/default`:

- `whatsapp_number`: owner-provided phone number including country code
- `whatsapp_message_template`: optional default message

The client converts this configuration to an encoded `https://wa.me/` URL. Do not invent or store private WhatsApp credentials.

## Verification before deployment

1. Run lint, typecheck, focused Ask/admin/auth/security tests, the emulator-aware full suite, and a production build.
2. Build once with `ADMIN_PANEL_ENABLED=false`; verify every local-admin page and BFF returns 404.
3. Scan production client artifacts for internal URLs and secret variable names/values.
4. Test `/ai/ask` in a real browser: catalogue hierarchy, typed-only input, short/long modes, cancellation, idempotent retry, usage/reset display, source labels, equations, citations, visuals, and all terminal/error states.
5. Verify usage loads once and is updated by Ask responses rather than polling.

## Real staging

Run approved-bank, textbook-grounded, General AI, disabled-fallback, quota/concurrency, idempotency, prompt activation/rollback, candidate approval/reuse, visual allow/deny, expired/invalid auth, direct-to-Railway rejection, and public-admin 404 scenarios.

Module 4 remains incomplete until the real Supabase/shared Redis/provider path is configured, staging no longer depends on the owner's laptop, both repositories are pushed to `main`, and the current GitHub Actions workflows are green.
