import type { ProjectState, SampleAsset } from "@/lib/model";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";

/**
 * Read-only project document for the public player. Goes through our own API,
 * which only serves projects the owner has explicitly made public.
 */
export async function loadPublicProject(
  projectId: string,
): Promise<{ project: ProjectState; name: string }> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/public`,
    { cache: "no-store" },
  );

  if (response.status === 403) {
    throw new Error("This project is private.");
  }
  if (response.status === 404) {
    throw new Error("This project does not exist.");
  }
  if (!response.ok) {
    throw new Error("This project is temporarily unavailable.");
  }

  return response.json();
}

async function realtimeToken(projectId: string): Promise<string> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/token`,
    { method: "POST", cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("You do not have permission to modify this project.");
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function uploadSample(
  file: File,
  projectId: string,
): Promise<SampleAsset> {
  const token = await realtimeToken(projectId);

  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_URL}/api/samples`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`Sample upload failed (${response.status})`);
  }

  const asset = (await response.json()) as SampleAsset;
  if (asset.url.startsWith("/")) {
    asset.url = `${API_URL}${asset.url}`;
  }
  return asset;
}
