"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SharedPlayer from "@/components/SharedPlayer";
import { loadPublicProject } from "@/lib/api";
import type { ProjectState } from "@/lib/model";

export default function SharedProjectPage() {
  const params = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    loadPublicProject(params.projectId)
      .then((result) => {
        if (cancelled) return;
        setProject(result.project);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "Unable to load this project.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.projectId]);

  if (loading) {
    return (
      <main className="shareShell">
        <p>Loading project…</p>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="shareShell">
        <p className="eyebrow">SHARED PROJECT</p>
        <h1>Project unavailable</h1>
        <p>{error || "This project can't be opened right now."}</p>
        <div className="shareButtons">
          <Link className="secondary linkButton" href="/">
            Go to MIDICOLLAB
          </Link>
        </div>
      </main>
    );
  }

  return <SharedPlayer project={project} />;
}
