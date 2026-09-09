import type { ProjectState } from "@/lib/model";
import { createDefaultProject } from "@/lib/default-project";
import { mintRealtimeToken, realtimeSecretConfigured } from "@/lib/realtime-token";

export const RUST_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";

/**
 * Fetch the authoritative musical document from the Rust backend.
 *
 * The Rust `GET` endpoint only serves private documents to a valid token, so
 * callers that have already done their own authorization (e.g. the public
 * player route, which gates on the Postgres `isPublic` flag) pass
 * `mintServiceToken: true` to fetch with a freshly minted read token.
 */
export async function fetchRustProject(
  projectId: string,
  options: { mintServiceToken?: boolean } = {},
): Promise<ProjectState | null> {
  const headers: Record<string, string> = {};
  if (options.mintServiceToken && realtimeSecretConfigured()) {
    const { token } = mintRealtimeToken({
      userId: "service",
      name: "service",
      projectId,
      role: "editor",
    });
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `${RUST_API_URL}/api/projects/${encodeURIComponent(projectId)}`,
      { cache: "no-store", headers },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProjectState;
  } catch {
    return null;
  }
}

/**
 * Seed the Rust document for a brand new project so the studio opens with the
 * right name/tempo straight away. Best-effort: on failure the Rust server still
 * lazily creates a default document on first websocket join.
 */
export async function seedRustProject(input: {
  projectId: string;
  name: string;
  bpm: number;
  bars: number;
  ownerId: string;
  ownerName: string;
  ownerImage?: string | null;
}): Promise<void> {
  if (!realtimeSecretConfigured()) return;

  const project = createDefaultProject(input.projectId);
  project.name = input.name;
  project.bpm = input.bpm;
  project.bars = input.bars;
  project.loopStartBar = 0;
  project.loopEndBar = input.bars;

  const { token } = mintRealtimeToken({
    userId: input.ownerId,
    name: input.ownerName,
    image: input.ownerImage,
    projectId: input.projectId,
    role: "owner",
  });

  const res = await fetch(
    `${RUST_API_URL}/api/projects/${encodeURIComponent(input.projectId)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(project),
    },
  );

  if (!res.ok) {
    throw new Error(`Rust seed failed (${res.status})`);
  }
}
