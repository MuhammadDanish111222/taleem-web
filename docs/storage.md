# Taleem AI Storage Architecture

## Ownership Model
Taleem AI stores PDF resources (books, notes, past papers) using a **Google Workspace Shared Drive**. 
The preferred access model uses a Service Account that is added as a member of this specific shared drive with Editor permissions. 
If a shared drive membership cannot be used, a Fallback mode using Domain-Wide Delegation is supported, requiring an explicitly configured delegated Workspace user.

Under no circumstances should personal "My Drive" ownership be used. This ensures organization data retention and prevents file loss if an individual account is closed.

## Trust Boundary
The architecture maintains a strict trust boundary:
`Browser` -> `Next.js Server Route (future)` -> `Resource Storage Service` -> `Google Drive API`

- The browser **never** receives Google Drive credentials.
- The browser **never** receives a permanent Google Drive URL, `webContentLink`, or `alternateLink`.
- The browser **never** supplies arbitrary Drive file IDs. 
- Internal storage keys (Drive file IDs) remain server-only.
- The application will proxy/stream authorized bytes to clients using controlled same-origin Next.js routes (Phase 2C).

## Environment Variables
The storage provider requires the following server-only environment variables:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_DRIVE_AUTH_MODE` | Yes | Either `shared_drive` (preferred) or `delegated`. |
| `GOOGLE_DRIVE_CLIENT_EMAIL` | Yes | Service account email. |
| `GOOGLE_DRIVE_PRIVATE_KEY` | Yes | Service account private key (escaped newlines). |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | Yes | ID of the Google Workspace Shared Drive. |
| `GOOGLE_DRIVE_CONTENT_FOLDER_ID` | Yes | Target folder ID inside the Shared Drive for uploads. |
| `GOOGLE_DRIVE_DELEGATED_USER` | Conditional | Workspace user email to impersonate. Required ONLY if `authMode` is `delegated`. |
| `GOOGLE_DRIVE_REQUEST_TIMEOUT_MS` | No | Timeout for Drive API requests (default: 15000). |
| `GOOGLE_DRIVE_MAX_ATTEMPTS` | No | Bounded retry attempts for transient errors (default: 3). |

_Note: None of these use the `NEXT_PUBLIC_` prefix._

## Version Lifecycle
Taleem AI resources use an immutable versioning system built on top of Firestore:
- **Resource ID Stability:** A resource maintains the same stable Firestore document ID throughout its lifecycle.
- **Initial Version:** Created atomically with the resource. Points to a specific storage object.
- **Replacement Version:** Creating a replacement creates a new immutable version document and updates the resource's `currentVersionId` pointer atomically.
- **Superseded Links:** The new version document holds a `supersedesVersionId` pointing to the old version.
- **Lifecycle Restrictions:** 
  - A published resource must be explicitly `hidden` before it can receive a replacement version.
  - An `archived` resource must be explicitly `restored` before it can receive a replacement version.
- **Preservation:** Old storage files and version documents are **preserved**. The hide/archive operations do **not** trigger storage deletion.
- **Explicit Deletion:** Storage deletion is reserved solely for later compensation and cleanup workflows.

## Range Streaming
The storage provider exposes `readRange` to support authorized HTTP 206 Partial Content streams. 
Phase 2C will use this to implement PDF preview and download routes without exposing signed URLs.

## Operations Checklist
- **Shared Drive Setup:** Create a Shared Drive and note its ID. Create a content folder within it and note its ID.
- **Service Account Membership:** Add the Service Account email to the Shared Drive with Editor access.
- **Emulator Tests:** Run `npm run test:rules` to verify Firestore rules with Firebase Emulator.
- **Smoke Test:** Run `RUN_DRIVE_SMOKE_TEST=true npm run test:phase-2a` if you wish to run live upload/read/delete against a real shared drive (requires configured `.env.local`).
- **Orphan Files:** If the smoke test crashes during execution, manually delete the `smoke_test.pdf` from the shared drive.
