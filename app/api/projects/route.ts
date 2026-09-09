import { requireContext } from "@/lib/server-context";
import { listProjectsForUser } from "@/lib/authz";
import { seedRustProject } from "@/lib/rust-backend";

function newProjectId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `p-${rand}`;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export async function GET(request: Request) {
  const result = await requireContext(request);
  if ("error" in result) return result.error;

  const projects = await listProjectsForUser(result.ctx);
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; bpm?: number; bars?: number }
    | null;

  const rawName =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : "Untitled session";
  if (rawName.length > 80) {
    return Response.json({ error: "Project name is too long" }, { status: 400 });
  }

  const bpm = clamp(Math.round(Number(body?.bpm ?? 124)) || 124, 50, 220);
  const bars = clamp(Math.round(Number(body?.bars ?? 8)) || 8, 1, 64);

  const id = newProjectId();
  const now = new Date();

  await ctx.db.insert(ctx.schema.project).values({
    id,
    ownerId: ctx.session.user.id,
    name: rawName,
    bpm,
    bars,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await seedRustProject({
      projectId: id,
      name: rawName,
      bpm,
      bars,
      ownerId: ctx.session.user.id,
      ownerName: ctx.session.user.name ?? "Producer",
      ownerImage: ctx.session.user.image ?? null,
    });
  } catch (error) {
    // Non-fatal: the Rust server lazily creates a default document on first
    // join. Log so a persistent misconfiguration is visible.
    console.error("Failed to seed Rust project", id, error);
  }

  return Response.json({ id, name: rawName, bpm, bars });
}
