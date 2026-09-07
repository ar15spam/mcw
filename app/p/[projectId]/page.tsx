"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SharedPlayer from "@/components/SharedPlayer";
import { loadProject } from "@/lib/api";
import type { ProjectState } from "@/lib/model";

export default function SharedProjectPage() {
  const params = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProject(params.projectId)
      .then(setProject)
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to load project"));
  }, [params.projectId]);

  if (error) {
    return <main className="shareShell"><h1>Project unavailable</h1><p>{error}</p></main>;
  }

  if (!project) {
    return <main className="shareShell"><p>Loading project…</p></main>;
  }

  return <SharedPlayer project={project} />;
}
