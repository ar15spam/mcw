import { requireContext } from "@/lib/server-context";
import { getProjectAccess } from "@/lib/authz";
import {
  mintRealtimeToken,
  realtimeSecretConfigured,
} from "@/lib/realtime-token";

type Params = { params: Promise<{ id: string }> };

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8080/ws";

/**
 * Mint a short-lived realtime token for the current user on this project.
 * The studio calls this on connect and again before every reconnect.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  const result = await requireContext(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  if (!realtimeSecretConfigured()) {
    return Response.json(
      { error: "Realtime is not configured. Set REALTIME_SHARED_SECRET." },
      { status: 503 },
    );
  }

  const access = await getProjectAccess(ctx, id);
  if (!access) {
    return Response.json(
      { error: "You do not have access to this project." },
      { status: 403 },
    );
  }

  const user = ctx.session.user;
  const { token, expiresAt } = mintRealtimeToken({
    userId: user.id,
    name: user.name ?? "Producer",
    image: user.image ?? null,
    projectId: id,
    role: access.role,
  });

  return Response.json({
    token,
    expiresAt,
    wsUrl: WS_URL,
    role: access.role,
    project: {
      id: access.project.id,
      name: access.project.name,
      bpm: access.project.bpm,
      bars: access.project.bars,
      isPublic: access.project.isPublic,
      ownerId: access.project.ownerId,
    },
    user: {
      id: user.id,
      name: user.name ?? "Producer",
      image: user.image ?? null,
    },
  });
}
