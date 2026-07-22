# Taleem AI Storage Architecture

## Ownership Model
Taleem AI supports flexible Google Drive storage modes tailored for production and development:
1. **OAuth2 Personal Account Mode (`oauth_user`)**: Uses Google Drive OAuth2 (`GOOGLE_DRIVE_REFRESH_TOKEN`) to store PDFs in a personal My Drive folder (`Taleem AI Content`). This avoids Workspace requirements during development.
2. **Workspace Shared Drive Mode (`shared_drive`)**: Uses a Service Account added as an Editor member of a Google Workspace Shared Drive.
3. **Workspace Delegation Mode (`delegated`)**: Uses Domain-Wide Delegation requiring a delegated Workspace user.

Under all modes, internal storage keys (Drive file IDs) remain 100% server-only and are never exposed to the client.

## Trust Boundary
The architecture maintains a strict trust boundary:
`Browser` -> `Next.js Server Route` -> `UploadService / Storage Provider` -> `Google Drive API`

- The browser **never** receives Google Drive credentials.
- The browser **never** receives a permanent Google Drive URL, `webContentLink`, or `alternateLink`.
- The browser **never** supplies arbitrary Drive file IDs. 
- Internal storage keys (Drive file IDs) remain server-only.
- The application proxies authorized bytes to clients using controlled same-origin Next.js routes.

## Environment Variables
The storage provider requires the following server-only environment variables:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_DRIVE_AUTH_MODE` | Yes | `oauth_user` (personal My Drive), `shared_drive`, or `delegated`. |
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth Mode | OAuth2 Client ID (required for `oauth_user`). |
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth Mode | OAuth2 Client Secret (required for `oauth_user`). |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | OAuth Mode | OAuth2 Refresh Token (required for `oauth_user`). |
| `GOOGLE_DRIVE_CLIENT_EMAIL` | Service Mode | Service account email (required for `shared_drive` / `delegated`). |
| `GOOGLE_DRIVE_PRIVATE_KEY` | Service Mode | Service account private key (required for `shared_drive` / `delegated`). |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | Shared Mode | ID of the Google Workspace Shared Drive (required for `shared_drive`). |
| `GOOGLE_DRIVE_CONTENT_FOLDER_ID` | Yes | Target folder ID inside Google Drive (`Taleem AI Content`). |
| `GOOGLE_DRIVE_DELEGATED_USER` | Delegated Mode | Workspace user email to impersonate (required for `delegated`). |
| `GOOGLE_DRIVE_REQUEST_TIMEOUT_MS` | No | Timeout for Drive API requests (default: 15000). |
| `GOOGLE_DRIVE_MAX_ATTEMPTS` | No | Bounded retry attempts for transient errors (default: 3). |

_Note: None of these use the `NEXT_PUBLIC_` prefix._

## Authorization Command
For personal Google Drive setup, run the one-time authorization command:
```bash
npm run drive:authorize
```
This command opens browser authorization, obtains your `GOOGLE_DRIVE_REFRESH_TOKEN`, automatically creates the target `"Taleem AI Content"` folder in your personal My Drive, and outputs the exact `.env.local` settings.

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
