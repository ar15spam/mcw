import { getContext } from "@/lib/server-context";
import { getProjectRow } from "@/lib/authz";
import { fetchRustProject } from "@/lib/rust-backend";

type Params = { params: Promise<{ id: string }> };

/**
 * Read-only project document for the public player at /p/<id>.
 * Only projects the owner has explicitly made public are served here.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await getContext(request);
  if ("error" in result) return result.error;

  const project = await getProjectRow(result.ctx, id);
  if (!project) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!project.isPublic) {
    return Response.json({ error: "private" }, { status: 403 });
  }

  const document = await fetchRustProject(id, { mintServiceToken: true });
  if (!document) {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }

  // Never leak transport intent through the public player.
  document.playing = false;
  document.startAtMs = null;

  return Response.json({ project: document, name: project.name });
}
