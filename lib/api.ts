import type { ProjectState, SampleAsset } from "@/lib/model";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";

export async function loadProject(projectId: string): Promise<ProjectState> {
  const response = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Project not found (${response.status})`);
  return response.json();
}

export async function saveProject(project: ProjectState): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/projects/${encodeURIComponent(project.projectId)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(project),
    },
  );
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
}

export async function uploadSample(file: File): Promise<SampleAsset> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_URL}/api/samples`, {
    method: "POST",
    body,
  });

  if (!response.ok) throw new Error(`Sample upload failed (${response.status})`);

  const asset = (await response.json()) as SampleAsset;
  if (asset.url.startsWith("/")) {
    asset.url = `${API_URL}${asset.url}`;
  }
  return asset;
}
