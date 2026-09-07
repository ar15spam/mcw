import { desc, eq } from "drizzle-orm";

function configError() {
  return Response.json(
    { error: "DATABASE_URL is not configured" },
    { status: 503 },
  );
}

async function getContext(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;

  const [{ auth }, { db }, schema] = await Promise.all([
    import("@/lib/auth"),
    import("@/db"),
    import("@/db/schema"),
  ]);

  const session = await auth.api.getSession({ headers: request.headers });
  return { auth, db, schema, session };
}

export async function GET(request: Request) {
  const context = await getContext(request);
  if (!context) return configError();
  if (!context.session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await context.db
    .select({
      id: context.schema.project.id,
      name: context.schema.project.name,
      bpm: context.schema.project.bpm,
      bars: context.schema.project.bars,
      updatedAt: context.schema.project.updatedAt,
      createdAt: context.schema.project.createdAt,
    })
    .from(context.schema.project)
    .where(eq(context.schema.project.ownerId, context.session.user.id))
    .orderBy(desc(context.schema.project.updatedAt))
    .limit(24);

  return Response.json({ projects: rows });
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if (!context) return configError();
  if (!context.session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { id?: string; name?: string; bpm?: number; bars?: number }
    | null;

  const id = payload?.id?.trim();
  const name = payload?.name?.trim();
  const bpm = Math.round(Number(payload?.bpm ?? 124));
  const bars = Math.round(Number(payload?.bars ?? 8));

  if (!id || !/^[a-zA-Z0-9_-]{2,80}$/.test(id)) {
    return Response.json({ error: "Invalid project id" }, { status: 400 });
  }

  if (!name || name.length > 80) {
    return Response.json({ error: "Invalid project name" }, { status: 400 });
  }

  if (bpm < 50 || bpm > 220 || bars < 1 || bars > 128) {
    return Response.json({ error: "Invalid project metadata" }, { status: 400 });
  }

  const existing = await context.db
    .select({ ownerId: context.schema.project.ownerId })
    .from(context.schema.project)
    .where(eq(context.schema.project.id, id))
    .limit(1);

  if (existing[0] && existing[0].ownerId !== context.session.user.id) {
    return Response.json({ error: "Project id already exists" }, { status: 409 });
  }

  const now = new Date();

  await context.db
    .insert(context.schema.project)
    .values({
      id,
      ownerId: context.session.user.id,
      name,
      bpm,
      bars,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: context.schema.project.id,
      set: {
        name,
        bpm,
        bars,
        updatedAt: now,
      },
    });

  return Response.json({ ok: true, id });
}
