# MIDICOLLAB Web

A collaborative browser music studio with a new product shell around the existing DAW.

This version adds:

- a full editorial music-product landing page at `/`
- signup at `/signup`
- login at `/login`
- an account/project dashboard at `/dashboard`
- the existing collaborative DAW moved to `/studio?project=<room-id>`
- the existing public player at `/p/<project-id>`
- Better Auth email/password auth
- optional Google OAuth
- Drizzle ORM + Neon Postgres
- Postgres project metadata while the Rust backend continues to own the realtime musical document
- the BPM/project-name draft fixes so server broadcasts do not fight the input while you type

## Architecture

```text
Browser
  |
  |-- Next.js / Vercel
  |     |-- landing / auth / dashboard
  |     |-- Better Auth
  |     `-- Drizzle ORM -> Neon Postgres
  |
  `-- Rust studio backend / Railway
        |-- HTTP + WebSocket realtime project state
        `-- /data Railway volume for project JSON + samples
```

Postgres is intentionally **not** replacing the Rust project store yet. It stores account and project metadata so you can add accounts/dashboard ownership without rewriting the realtime backend.

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Keep your existing Railway backend values:

```env
NEXT_PUBLIC_API_URL=https://YOUR-STUDIO-BACKEND.up.railway.app
NEXT_PUBLIC_WS_URL=wss://YOUR-STUDIO-BACKEND.up.railway.app/ws
```

## 2. Create a Neon database

Create a Neon Postgres project and copy its connection string into:

```env
DATABASE_URL=postgresql://...
```

Drizzle supports Neon directly with the serverless HTTP driver used in `db/index.ts`.

## 3. Configure Better Auth

Generate a strong secret, for example:

```bash
openssl rand -base64 32
```

Then set:

```env
BETTER_AUTH_SECRET=YOUR_RANDOM_SECRET
BETTER_AUTH_URL=http://localhost:3000
```

For Vercel, change `BETTER_AUTH_URL` to the deployed HTTPS site URL.

## 4. Push the Drizzle schema

```bash
npm run db:push
```

Tables created by `db/schema.ts`:

```text
user
session
account
verification
project
project_member
```

The first four are Better Auth's core database models. `project` and `project_member` belong to MIDICOLLAB.

## 5. Optional Google login

Create Google OAuth credentials and add:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
```

If those are absent, email/password still works. The Google button stays visible but explains that setup is required.

## 6. Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful routes:

```text
/                    landing page
/signup              create account
/login               sign in
/dashboard           project dashboard
/studio              collaborative DAW
/studio?project=x    open a particular room/project
/p/x                  public shared player
```

## 7. Vercel environment variables

Add all production values in Vercel:

```env
NEXT_PUBLIC_API_URL=https://YOUR-STUDIO-BACKEND.up.railway.app
NEXT_PUBLIC_WS_URL=wss://YOUR-STUDIO-BACKEND.up.railway.app/ws
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://YOUR-VERCEL-DOMAIN.vercel.app
```

And, only if using Google:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
```

## Project metadata sync

The DAW's existing **Save** button still saves the full musical project to the Rust backend first. It then makes a best-effort call to `/api/projects` so logged-in users get the project name/BPM/bars in their dashboard.

This means a database/auth outage does **not** prevent the Rust project from saving.

## Next architecture step

Once accounts/dashboard/collaboration are stable, a good next migration is to make Postgres the index of all projects and replace the JSON project document with object/database storage behind the Rust server. Do that later; there is no reason to destabilize realtime collaboration now.
