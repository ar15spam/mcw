import { eq } from "drizzle-orm";
import { requireContext } from "@/lib/server-context";
import { getProjectAccess, PROJECT_ID_RE } from "@/lib/authz";

type Params = { params: Promise<{ id: string }> };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const access = await getProjectAccess(ctx, id);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const { project, role } = access;

  const owner = await ctx.db
    .select({
      id: ctx.schema.user.id,
      name: ctx.schema.user.name,
      image: ctx.schema.user.image,
    })
    .from(ctx.schema.user)
    .where(eq(ctx.schema.user.id, project.ownerId))
    .limit(1);

  const collaborators = await ctx.db
    .select({
      id: ctx.schema.user.id,
      name: ctx.schema.user.name,
      image: ctx.schema.user.image,
      role: ctx.schema.projectMember.role,
    })
    .from(ctx.schema.projectMember)
    .innerJoin(
      ctx.schema.user,
      eq(ctx.schema.projectMember.userId, ctx.schema.user.id),
    )
    .where(eq(ctx.schema.projectMember.projectId, id));

  const members = [
    ...(owner[0]
      ? [{ ...owner[0], role: "owner" as const }]
      : []),
    ...collaborators.map((c) => ({
      id: c.id,
      name: c.name,
      image: c.image,
      role: "editor" as const,
    })),
  ];

  return Response.json({
    project: {
      id: project.id,
      name: project.name,
      bpm: project.bpm,
      bars: project.bars,
      isPublic: project.isPublic,
      ownerId: project.ownerId,
      updatedAt: project.updatedAt.toISOString(),
      createdAt: project.createdAt.toISOString(),
    },
    role,
    members,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!PROJECT_ID_RE.test(id)) {
    return Response.json({ error: "Invalid project id" }, { status: 400 });
  }

  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const access = await getProjectAccess(ctx, id);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; bpm?: number; bars?: number; isPublic?: boolean }
    | null;
  if (!body) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 80) {
      return Response.json({ error: "Invalid project name" }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.bpm !== undefined) {
    patch.bpm = clamp(Math.round(Number(body.bpm)) || 124, 50, 220);
  }

  if (body.bars !== undefined) {
    patch.bars = clamp(Math.round(Number(body.bars)) || 8, 1, 64);
  }

  if (body.isPublic !== undefined) {
    if (access.role !== "owner") {
      return Response.json(
        { error: "Only the owner can change sharing" },
        { status: 403 },
      );
    }
    patch.isPublic = Boolean(body.isPublic);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  patch.updatedAt = new Date();

  await ctx.db
    .update(ctx.schema.project)
    .set(patch)
    .where(eq(ctx.schema.project.id, id));

  // This only updates the dashboard mirror. Name/BPM/bars edits made inside the
  // studio already reach the authoritative Rust document over the websocket;
  // when a project is renamed from the dashboard the studio reconciles the Rust
  // document on its next join.
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const access = await getProjectAccess(ctx, id);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (access.role !== "owner") {
    return Response.json(
      { error: "Only the owner can delete this project" },
      { status: 403 },
    );
  }

  await ctx.db
    .update(ctx.schema.project)
    .set({ deletedAt: new Date() })
    .where(eq(ctx.schema.project.id, id));

  await ctx.db
    .delete(ctx.schema.projectMember)
    .where(eq(ctx.schema.projectMember.projectId, id));

  return Response.json({ ok: true });
}
