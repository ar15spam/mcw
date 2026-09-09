# MIDICOLLAB — Deployment checklist

Two services deploy separately:

| Service        | Repo  | Host    |
| -------------- | ----- | ------- |
| Web (Next.js)  | `mcw` | Vercel  |
| Realtime (Rust)| `ms`  | Railway |
| Database       | —     | Neon    |

They are tied together by **one shared secret**: `REALTIME_SHARED_SECRET` must
be byte-for-byte identical on Vercel and Railway.

---

## 1. Generate the shared secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Keep this value handy for steps 2 and 3.

---

## 2. Rust realtime backend → Railway (`ms` repo)

Deploy order matters: **deploy the backend before (or with) the frontend** so it
understands the new token-based `join` message.

Environment variables:

| Key                       | Value                                              |
| ------------------------- | ------------------------------------------------- |
| `REALTIME_SHARED_SECRET`  | the value from step 1                              |
| `DATA_DIR`                | `/data`                                            |
| `PORT`                    | Railway sets this automatically                    |

**Persistent volume (required):** mount a Railway volume at `/data`. Without it,
every redeploy wipes all projects and uploaded samples — "come back later, the
project is still there" will fail.

The container builds `studio_server` (see `Dockerfile`). Health check: `GET /health`
returns `ok`.

CORS is currently open (`Any`); the HMAC token is what actually gates writes and
room access. Tightening CORS to the Vercel origin is a fine post-MVP hardening
step.

---

## 3. Web app → Vercel (`mcw` repo)

Set every key (Production scope):

| Key                        | Value                                                   |
| -------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`      | `https://<your-backend>.up.railway.app`                 |
| `NEXT_PUBLIC_WS_URL`       | `wss://<your-backend>.up.railway.app/ws`                |
| `DATABASE_URL`             | Neon **pooled** connection string                      |
| `BETTER_AUTH_SECRET`       | `openssl rand -base64 32`                               |
| `BETTER_AUTH_URL`          | `https://<your-app-domain>`  (exact deployed origin)    |
| `REALTIME_SHARED_SECRET`   | the value from step 1 (same as Railway)                 |

Optional Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. If absent, email/password still works and
the Google button explains setup is required. If you enable it, add
`https://<your-app-domain>/api/auth/callback/google` as an authorized redirect URI.

---

## 4. Database → Neon

```bash
# with production DATABASE_URL in .env.local
npm run db:push
```

Additive change from the previous schema: `project.is_public` (bool, default
false) and `project.deleted_at` (nullable timestamp). No table rewrites, no
Better Auth changes.

---

## 5. Verify production

- `GET https://<backend>/health` → `ok`
- Sign up on the deployed site → land on `/dashboard`
- New project → studio shows **● Live** and your name in presence
- Share → open the invite link in a second browser profile → second account
  lands in the same studio → edits sync both ways
- Refresh both → project intact
- In studio, Share → toggle "Public listen link" → open `/p/<id>` logged out →
  read-only player plays, no edit controls

---

## Notes / known limitations (MVP)

- **Rename from the dashboard** while a collaborator has the project open only
  reaches the live session the next time it is opened (it always reaches Neon
  immediately). Renaming inside the studio propagates live.
- **Soft delete**: deleting a project sets `deleted_at` and removes memberships.
  The Rust JSON document is left on the volume (harmless, unreachable). A
  periodic cleanup job is post-MVP.
- **Samples** are stored on the Railway volume and referenced by absolute URL.
  Changing `NEXT_PUBLIC_API_URL` after uploads would break old sample URLs.
- The `/explore` page is a static preview using sample content.
