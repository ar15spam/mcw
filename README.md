# MIDICOLLAB Web

A collaborative browser music studio. Make music in your browser with another
person in real time — create a project, share a link, and edit the same session
together.

This is the Next.js front end. The realtime engine lives in a separate Rust
service (`ms` repo, deployed to Railway).

## The core loop

```
sign up → dashboard → new project → studio opens → make music
        → Share → friend opens link → friend signs in → friend lands in the same studio
        → both edit live → autosaves → leave → come back → project is still there
```

## Architecture

```text
Browser
  │
  ├── Next.js (Vercel)
  │     ├── landing / auth / dashboard / invite
  │     ├── Better Auth  (email + password, optional Google)
  │     ├── Drizzle ORM → Neon Postgres   (accounts, project metadata, membership)
  │     └── /api/projects/[id]/token      (mints short-lived HMAC tokens)
  │
  └── Rust studio backend (Railway)
        ├── WebSocket rooms — authoritative musical ProjectState
        ├── verifies the HMAC token on join (identity + role, no DB needed)
        └── /data volume — project JSON + uploaded samples
```

Postgres never holds the musical document. It stores who owns what and mirrors
`name / bpm / bars / isPublic / updatedAt` so the dashboard can render without
touching the Rust service. The Rust service is authoritative for the song.

### How access control works

1. The browser asks `POST /api/projects/[id]/token`.
2. Next.js checks the Better Auth session **and** that the user owns the project
   or is a member of it.
3. If so it returns a token signed with `REALTIME_SHARED_SECRET`, valid ~5 min,
   carrying `{ userId, name, image, projectId, role }`.
4. The browser opens the WebSocket and sends `{ type: "join", project_id, token }`.
5. The Rust server verifies the signature + expiry + that the token is for this
   project. Presence and the editor/owner gate come straight from the token.

Tokens are re-minted automatically on every reconnect.

## Local development

You need three things running: Neon (hosted), the Rust backend, and this app.

```bash
npm install
cp .env.example .env.local     # then fill in the values
```

`REALTIME_SHARED_SECRET` must be **identical** in `.env.local` and wherever the
Rust backend runs.

### Point at a local Rust backend

The simplest local setup runs the Rust service on `:8090`:

```bash
# in the ms repo
DATA_DIR=./data \
REALTIME_SHARED_SECRET=<same value as .env.local> \
PORT=8090 \
cargo run --release --bin studio_server
```

```bash
# in this repo
NEXT_PUBLIC_API_URL=http://localhost:8090 \
NEXT_PUBLIC_WS_URL=ws://localhost:8090/ws \
npm run dev
```

Or point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` at your deployed Railway
backend (which must already have the matching `REALTIME_SHARED_SECRET`).

### Database

```bash
npm run db:push       # apply db/schema.ts to Neon
npm run db:studio     # browse data
```

Tables: `user`, `session`, `account`, `verification` (Better Auth) and
`project`, `project_member` (MIDICOLLAB).

## Routes

```text
/                         landing
/signup  /login           auth  (accept ?next= to resume an invite)
/dashboard                 your projects (owned + shared)
/studio?project=<id>       the collaborative studio
/join/<id>                 invite link — signs in then drops you in the studio
/p/<id>                    public read-only player (only if the owner enabled it)
/explore                   community preview (sample content, not a launch blocker)
```

## Deploying

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full checklist. Short version:

1. Deploy the Rust backend (`ms` repo) to Railway with a `/data` **volume**,
   `REALTIME_SHARED_SECRET`, and `DATA_DIR=/data`.
2. Set every key from `.env.example` in Vercel (production values, `https://` +
   `wss://`, `BETTER_AUTH_URL` = your deployed origin).
3. `npm run db:push` against the production Neon branch.
4. Deploy this app to Vercel.
