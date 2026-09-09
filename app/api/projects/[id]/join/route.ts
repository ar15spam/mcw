import { and, eq } from "drizzle-orm";
import { getContext } from "@/lib/server-context";
import { getProjectRow } from "@/lib/authz";

type Params = { params: Promise<{ id: string }> };

/** Public invite preview: just enough to render the invite landing page. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await getContext(request);
  if ("error" in result) return result.error;

  const project = await getProjectRow(result.ctx, id);
  if (!project) {
    return Response.json({ error: "invite_invalid" }, { status: 404 });
  }

  const signedIn = Boolean(result.session);
  let alreadyMember = false;
  let isOwner = false;

  if (result.session) {
    const userId = result.session.user.id;
    isOwner = project.ownerId === userId;
    if (!isOwner) {
      const member = await result.ctx.db
        .select({ userId: result.ctx.schema.projectMember.userId })
        .from(result.ctx.schema.projectMember)
        .where(
          and(
            eq(result.ctx.schema.projectMember.projectId, id),
            eq(result.ctx.schema.projectMember.userId, userId),
          ),
        )
        .limit(1);
      alreadyMember = member.length > 0;
    }
  }

  return Response.json({
    projectId: project.id,
    projectName: project.name,
    signedIn,
    alreadyMember: alreadyMember || isOwner,
    isOwner,
  });
}

/** Accept an invite: create membership (idempotent) for the signed-in user. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await getContext(request);
  if ("error" in result) return result.error;

  if (!result.session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await getProjectRow(result.ctx, id);
  if (!project) {
    return Response.json({ error: "invite_invalid" }, { status: 404 });
  }

  const userId = result.session.user.id;

  if (project.ownerId !== userId) {
    await result.ctx.db
      .insert(result.ctx.schema.projectMember)
      .values({ projectId: id, userId, role: "editor" })
      .onConflictDoNothing();
  }

  return Response.json({ ok: true, projectId: id });
}
