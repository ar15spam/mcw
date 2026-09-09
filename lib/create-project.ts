"use client";

/** Create a project and return its id. Throws with a readable message. */
export async function createProject(
  name = "Untitled session",
): Promise<string> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };

  if (!response.ok || !body.id) {
    throw new Error(body.error || "Could not create the project. Try again.");
  }

  return body.id;
}
