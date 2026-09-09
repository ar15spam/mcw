import type { auth as authInstance } from "@/lib/auth";
import type { db as dbInstance } from "@/db";
import type * as dbSchema from "@/db/schema";

type Session = NonNullable<
  Awaited<ReturnType<typeof authInstance.api.getSession>>
>;

export type ServerContext = {
  auth: typeof authInstance;
  db: typeof dbInstance;
  schema: typeof dbSchema;
};

export type AuthedContext = ServerContext & { session: Session };

function configured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
}

function notConfigured(): Response {
  return Response.json(
    { error: "Server is not configured. Missing database or auth secret." },
    { status: 503 },
  );
}

async function loadContext(): Promise<ServerContext> {
  const [{ auth }, { db }, schema] = await Promise.all([
    import("@/lib/auth"),
    import("@/db"),
    import("@/db/schema"),
  ]);
  return { auth, db, schema };
}

/** For public routes: context is always present, session may be null. */
export async function getContext(
  request: Request,
): Promise<
  { error: Response } | { ctx: ServerContext; session: Session | null }
> {
  if (!configured()) return { error: notConfigured() };
  const ctx = await loadContext();
  const session = await ctx.auth.api.getSession({ headers: request.headers });
  return { ctx, session: session ?? null };
}

/** For authenticated routes: returns a 401 Response when there is no session. */
export async function requireContext(
  request: Request,
): Promise<{ error: Response } | { ctx: AuthedContext }> {
  if (!configured()) return { error: notConfigured() };
  const base = await loadContext();
  const session = await base.auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ctx: { ...base, session } };
}
