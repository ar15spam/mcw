import { requireContext } from "@/lib/server-context";
import { getProjectAccess } from "@/lib/authz";
import { fetchRustProject } from "@/lib/rust-backend";
import { runAgent, agentConfigured, agentMode } from "@/lib/agent";
import type { AgentSelection } from "@/lib/agent/types";

// crude best-effort per-user throttle (resets on redeploy)
const lastCall = new Map<string, number>();
const MIN_GAP_MS = 700;

export async function GET() {
  return Response.json({ configured: agentConfigured(), mode: agentMode() });
}

export async function POST(request: Request) {
  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  if (!agentConfigured()) {
    return Response.json(
      {
        ok: false,
        code: "not_configured",
        error:
          "The co-producer isn't connected yet. Add an ANTHROPIC_API_KEY or OPENAI_API_KEY on the server.",
      },
      { status: 200 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    projectId?: string;
    message?: string;
    selection?: Partial<AgentSelection>;
    history?: Array<{ role?: string; text?: string }>;
  } | null;

  const projectId = body?.projectId?.trim();
  const message = typeof body?.message === "string" ? body.message : "";

  if (!projectId || !message.trim()) {
    return Response.json(
      { ok: false, code: "invalid_request", error: "Missing project or message." },
      { status: 400 },
    );
  }

  const access = await getProjectAccess(ctx, projectId);
  if (!access) {
    return Response.json(
      { ok: false, code: "no_access", error: "You can't edit this project." },
      { status: 403 },
    );
  }

  const userId = ctx.session.user.id;
  const now = Date.now();
  const prev = lastCall.get(userId) ?? 0;
  if (now - prev < MIN_GAP_MS) {
    return Response.json(
      { ok: false, code: "rate_limited", error: "One at a time — try again." },
      { status: 429 },
    );
  }
  lastCall.set(userId, now);

  const project = await fetchRustProject(projectId, { mintServiceToken: true });
  if (!project) {
    return Response.json(
      { ok: false, code: "provider_error", error: "Couldn't load the project." },
      { status: 502 },
    );
  }

  const selection: AgentSelection = {
    trackId:
      body?.selection?.trackId &&
      project.tracks.some((t) => t.id === body.selection!.trackId)
        ? body.selection!.trackId!
        : null,
    clipId: body?.selection?.clipId ?? null,
  };

  const history = (body?.history ?? [])
    .filter(
      (t): t is { role: "you" | "agent"; text: string } =>
        (t.role === "you" || t.role === "agent") && typeof t.text === "string",
    )
    .slice(-6);

  const agentResult = await runAgent({ message, project, selection, history });
  return Response.json(agentResult, { status: 200 });
}
