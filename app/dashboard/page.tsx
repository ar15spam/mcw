"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

type ProjectRow = {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  updatedAt: string;
  createdAt: string;
};

function makeProjectId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `jam-${random}`;
}

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!session?.user) return;

    setLoadingProjects(true);
    fetch("/api/projects")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load projects");
        return body as { projects: ProjectRow[] };
      })
      .then((body) => setProjects(body.projects))
      .catch((cause) => setProjectError(cause instanceof Error ? cause.message : "Could not load projects"))
      .finally(() => setLoadingProjects(false));
  }, [session?.user]);

  const firstName = useMemo(() => {
    const name = session?.user?.name?.trim();
    return name ? name.split(/\s+/)[0] : "Producer";
  }, [session?.user?.name]);

  async function createProject() {
    if (!session?.user || creating) return;
    setCreating(true);
    setProjectError("");

    const id = makeProjectId();
    const name = "Untitled session";

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, bpm: 124, bars: 8 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create project");
      router.push(`/studio?project=${encodeURIComponent(id)}`);
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : "Could not create project");
      setCreating(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  if (isPending) {
    return (
      <main className="dashboardPage">
        <div className="dashboardBoot">Loading workspace...</div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="dashboardPage dashboardLoggedOut">
        <nav className="dashNav dashNavV2">
          <Link className="wordmark" href="/">
            <span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            MIDICOLLAB
          </Link>
          <div className="dashNavSpacer" />
          <Link className="dashNavTextLink" href="/login">Sign in</Link>
        </nav>

        <section className="dashboardEmptyState dashboardEmptyStateV2">
          <p>Workspace unavailable</p>
          <h1>{sessionError ? "Auth isn't connected yet." : "Sign in to see your projects."}</h1>
          <span>
            {sessionError
              ? "Check your auth and database environment variables, then reload the app."
              : "Your projects and collaborative sessions live here."}
          </span>
          <div>
            <Link className="dashPrimaryButton" href="/login">Sign in</Link>
            <Link className="dashSecondaryButton" href="/signup">Create account</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboardPage dashboardPageV2">
      <nav className="dashNav dashNavV2">
        <Link className="wordmark" href="/">
          <span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          MIDICOLLAB
        </Link>

        <div className="dashNavMiddle dashNavMiddleV2">
          <Link href="/dashboard" className="active">Projects</Link><Link href="/explore">Explore</Link>
        </div>

        <div className="dashAccount dashAccountV2">
          <i>{session.user.name?.[0]?.toUpperCase() || "U"}</i>
          <span>{session.user.name || session.user.email}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div className="dashboardFrame">
        <header className="dashboardHeaderV2">
          <div className="dashboardTitleBlock">
            <span className="dashboardKicker">Your workspace</span>
            <h1>Projects</h1>
            <p>Welcome back, {firstName}. Pick up where you left off or start a new session.</p>
          </div>

          <button className="dashboardCreateButton" onClick={createProject} disabled={creating}>
            <span>+</span>
            {creating ? "Creating..." : "New project"}
          </button>
        </header>

        <section className="dashboardUtilityBar">
          <form
            className="dashboardJoinForm"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const room = String(data.get("room") || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
              if (room) router.push(`/studio?project=${encodeURIComponent(room)}`);
            }}
          >
            <label htmlFor="quick-room">Join a room</label>
            <div>
              <input id="quick-room" name="room" placeholder="Enter room ID" aria-label="Room id" />
              <button>Join</button>
            </div>
          </form>

          <div className="dashboardSyncStatus">
            <span className="syncDot" />
            {loadingProjects ? "Syncing projects" : "Workspace synced"}
          </div>
        </section>

        <section className="dashboardProjects dashboardProjectsV2">
          <div className="dashboardSectionHead dashboardSectionHeadV2">
            <div>
              <h2>Recent</h2>
              <span>{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
            </div>
          </div>

          {projectError && <div className="dashboardError">{projectError}</div>}

          <div className="projectGrid projectGridV2">
            {projects.map((project, index) => (
              <Link
                className={`projectCard projectCardV2 projectVariant${index % 4}`}
                href={`/studio?project=${encodeURIComponent(project.id)}`}
                key={project.id}
              >
                <div className="projectCardVisual" aria-hidden="true">
                  <div className="projectCardBar">
                    <span>{project.bpm}</span>
                    <small>BPM</small>
                  </div>
                  <div className="projectCardPattern">
                    {Array.from({ length: 32 }, (_, cell) => (
                      <i key={cell} className={(cell + index * 2) % 5 === 0 || (cell + index) % 11 === 0 ? "on" : ""} />
                    ))}
                  </div>
                  <span className="projectCardPlay">▶</span>
                </div>

                <div className="projectCardContent">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.bpm} BPM · {project.bars} bars</p>
                  </div>
                  <div className="projectCardMeta">
                    <span>{relativeDate(project.updatedAt)}</span>
                    <span>Open →</span>
                  </div>
                </div>
              </Link>
            ))}

            {!loadingProjects && projects.length === 0 && (
              <button className="emptyProjectCard emptyProjectCardV2" onClick={createProject}>
                <span>+</span>
                <strong>Create your first project</strong>
                <p>Start with the default 8-bar session and invite someone when you're ready.</p>
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
