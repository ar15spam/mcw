import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AuthedContext, ServerContext } from "@/lib/server-context";
import type { RealtimeRole } from "@/lib/realtime-token";

export type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  bpm: number;
  bars: number;
  isPublic: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectAccess = { project: ProjectRow; role: RealtimeRole };

/** The caller's role on a project, or null if they cannot access it. */
export async function getProjectAccess(
  ctx: AuthedContext,
  projectId: string,
): Promise<ProjectAccess | null> {
  const { db, schema, session } = ctx;

  const rows = await db
    .select()
    .from(schema.project)
    .where(
      and(eq(schema.project.id, projectId), isNull(schema.project.deletedAt)),
    )
    .limit(1);

  const project = rows[0] as ProjectRow | undefined;
  if (!project) return null;

  if (project.ownerId === session.user.id) return { project, role: "owner" };

  const member = await db
    .select({ role: schema.projectMember.role })
    .from(schema.projectMember)
    .where(
      and(
        eq(schema.projectMember.projectId, projectId),
        eq(schema.projectMember.userId, session.user.id),
      ),
    )
    .limit(1);

  if (member[0]) return { project, role: "editor" };
  return null;
}

/** A non-deleted project row without any access check (public/listen paths). */
export async function getProjectRow(
  ctx: ServerContext,
  projectId: string,
): Promise<ProjectRow | null> {
  const rows = await ctx.db
    .select()
    .from(ctx.schema.project)
    .where(
      and(
        eq(ctx.schema.project.id, projectId),
        isNull(ctx.schema.project.deletedAt),
      ),
    )
    .limit(1);
  return (rows[0] as ProjectRow | undefined) ?? null;
}

export type ProjectSummary = {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  isPublic: boolean;
  updatedAt: string;
  createdAt: string;
  role: RealtimeRole;
};

/** Every project the user owns or collaborates on, newest first. */
export async function listProjectsForUser(
  ctx: AuthedContext,
): Promise<ProjectSummary[]> {
  const { db, schema, session } = ctx;
  const userId = session.user.id;

  const owned = await db
    .select()
    .from(schema.project)
    .where(
      and(
        eq(schema.project.ownerId, userId),
        isNull(schema.project.deletedAt),
      ),
    )
    .orderBy(desc(schema.project.updatedAt))
    .limit(100);

  const memberships = await db
    .select({ projectId: schema.projectMember.projectId })
    .from(schema.projectMember)
    .where(eq(schema.projectMember.userId, userId));

  const memberIds = memberships.map((m) => m.projectId);

  const memberProjects = memberIds.length
    ? await db
        .select()
        .from(schema.project)
        .where(
          and(
            inArray(schema.project.id, memberIds),
            ne(schema.project.ownerId, userId),
            isNull(schema.project.deletedAt),
          ),
        )
        .orderBy(desc(schema.project.updatedAt))
        .limit(100)
    : [];

  const rows: Array<{ row: ProjectRow; role: RealtimeRole }> = [
    ...owned.map((row) => ({ row: row as ProjectRow, role: "owner" as const })),
    ...memberProjects.map((row) => ({
      row: row as ProjectRow,
      role: "editor" as const,
    })),
  ];

  return rows
    .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime())
    .map(({ row, role }) => ({
      id: row.id,
      name: row.name,
      bpm: row.bpm,
      bars: row.bars,
      isPublic: row.isPublic,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      role,
    }));
}

export const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{2,64}$/;
