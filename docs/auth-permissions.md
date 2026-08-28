# Authentication and Permissions

Authentication uses short-lived JWT access tokens and longer-lived rotating refresh JWTs. Registration normalizes email addresses and requires a 12–128 character password containing upper-case, lower-case, and numeric characters; passwords are stored with bcrypt cost 12.

The API exposes `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and protected `GET /auth/me`. Access tokens are returned in response bodies and sent as Bearer tokens. Refresh tokens are placed in the `collab_docs_refresh` HttpOnly, SameSite=Lax cookie scoped to `/`; it is Secure in production. The root path lets lightweight Next.js routing detect session presence while the HttpOnly flag keeps the token unavailable to browser JavaScript.

Every refresh JWT names a persisted session and rotation family. Only a SHA-256 token hash is stored. Rotation atomically revokes the old row, links its replacement, and creates the new session. Reuse of a stale rotated token revokes all still-active sessions in that family. Logout revokes the matching session and clears the cookie. Access guards also load the current user, so deleted users lose access before token expiry.

Login attempts are limited per hashed email/IP key through Redis. Passwords, cookies, authorization headers, and raw JWTs are not included in request logs or authentication errors.

Workspace roles are `OWNER`, `ADMIN`, `EDITOR`, and `VIEWER`. The centralized backend policy service resolves authoritative membership and explicit capabilities; controllers and feature services do not duplicate raw role checks. Outsiders and users of deleted workspaces receive a not-found response to avoid workspace ID enumeration.

- `OWNER` has all workspace, membership, billing, and document capabilities.
- `ADMIN` can manage the workspace and non-owner members and has all document capabilities, but cannot manage billing or workspace ownership.
- `EDITOR` can read the workspace and create, read, and edit documents.
- `VIEWER` can read the workspace and documents only.

Capabilities are named `workspace.read`, `workspace.manage`, `member.invite`, `member.manage`, `billing.manage`, `document.create`, `document.read`, `document.edit`, `document.delete`, and `document.publish`. Active document-specific grants and share links are combined with this policy only for their intended document and access mode.

Workspace creation atomically creates the owner membership and Free subscription. Membership uniqueness is enforced by the database. Invitations use a cryptographically random token while only its SHA-256 hash is persisted; they expire after seven days, can be accepted only once, and must match the authenticated user's normalized email. Acceptance and membership creation are one transaction.

Owners and administrators manage members and view pending invitations from the workspace dashboard. Invitation delivery is in-app: after login or registration, the workspace selection page lists active invitations matching the authenticated user's normalized email. The user may accept or decline there; acceptance atomically creates membership and consumes the invitation, while decline consumes it without membership. The cryptographic token endpoint remains available for future email delivery, but raw tokens are not part of the normal UI.

The owner membership cannot be removed or demoted through membership endpoints. Only an owner can assign or manage administrators; administrators may manage editors and viewers. Sensitive role and removal operations re-check actor membership inside the mutation transaction.

Every REST operation, search result, attachment action, and WebSocket room join must resolve authoritative access server-side. A Viewer cannot mutate through either REST or collaboration protocols. Revocation or document deletion must terminate future writes and active sessions safely.

Document share links resolve through `/share/[token]`. View links expose only the selected document projection. Edit links still require an authenticated identity before the Yjs provider joins with the share token; they do not create workspace membership or reveal the workspace tree. Revocation and expiration are rechecked by the API and collaboration authorizer.

Permission resolution is strongly consistent and must never depend on search indexes, client state, or cached public projections.
