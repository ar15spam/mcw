"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { createProject } from "@/lib/create-project";

type ProjectRow = {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  isPublic: boolean;
  updatedAt: string;
  createdAt: string;
  role: "owner" | "editor";
};

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
  const { data: session, isPending, error: sessionError } =
    authClient.useSession();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadProjects = useCallback(() => {
    setLoadingProjects(true);
    setProjectError("");
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load projects");
        return body as { projects: ProjectRow[] };
      })
      .then((body) => setProjects(body.projects))
      .catch((cause) =>
        setProjectError(
          cause instanceof Error ? cause.message : "Could not load projects",
        ),
      )
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    loadProjects();
  }, [session?.user, loadProjects]);

  const firstName = useMemo(() => {
    const name = session?.user?.name?.trim();
    return name ? name.split(/\s+/)[0] : "Producer";
  }, [session?.user?.name]);

  async function handleCreate() {
    if (!session?.user || creating) return;
    setCreating(true);
    setProjectError("");
    try {
      const id = await createProject();
      router.push(`/studio?project=${encodeURIComponent(id)}`);
    } catch (cause) {
      setProjectError(
        cause instanceof Error ? cause.message : "Could not create project",
      );
      setCreating(false);
    }
  }

  async function submitRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const previous = projects;
    setProjects((rows) =>
      rows.map((row) => (row.id === id ? { ...row, name } : row)),
    );
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setProjects(previous);
      setProjectError("Rename failed. Try again.");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (
      !window.confirm(
        `Delete “${name}”? This removes it for you and everyone you invited. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    const previous = projects;
    setProjects((rows) => rows.filter((row) => row.id !== id));
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setProjects(previous);
      setProjectError("Delete failed. Try again.");
    } finally {
      setBusyId(null);
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
        <div className="dashboardBoot">Loading workspace…</div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="dashboardPage dashboardLoggedOut">
        <nav className="dashNav dashNavV2">
          <Link className="wordmark" href="/">
            <span className="markBars" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            MIDICOLLAB
          </Link>
          <div className="dashNavSpacer" />
          <Link className="dashNavTextLink" href="/login">
            Sign in
          </Link>
        </nav>

        <section className="dashboardEmptyState dashboardEmptyStateV2">
          <p>Workspace unavailable</p>
          <h1>
            {sessionError
              ? "Auth isn't connected yet."
              : "Sign in to see your projects."}
          </h1>
          <span>
            {sessionError
              ? "Check your auth and database environment variables, then reload the app."
              : "Your projects and collaborative sessions live here."}
          </span>
          <div>
            <Link className="dashPrimaryButton" href="/login">
              Sign in
            </Link>
            <Link className="dashSecondaryButton" href="/signup">
              Create account
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboardPage dashboardPageV2">
      <nav className="dashNav dashNavV2">
        <Link className="wordmark" href="/">
          <span className="markBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          MIDICOLLAB
        </Link>

        <div className="dashNavMiddle dashNavMiddleV2">
          <Link href="/dashboard" className="active">
            Projects
          </Link>
          <Link href="/explore">Explore</Link>
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
            <p>
              Welcome back, {firstName}. Pick up where you left off or start a new
              session.
            </p>
          </div>

          <button
            className="dashboardCreateButton"
            onClick={handleCreate}
            disabled={creating}
          >
            <span>+</span>
            {creating ? "Creating…" : "New project"}
          </button>
        </header>

        <section className="dashboardProjects dashboardProjectsV2">
          <div className="dashboardSectionHead dashboardSectionHeadV2">
            <div>
              <h2>Recent</h2>
              <span>
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>
            {!loadingProjects && (
              <button className="dashboardRefresh" onClick={loadProjects}>
                Refresh
              </button>
            )}
          </div>

          {projectError && <div className="dashboardError">{projectError}</div>}

          {loadingProjects && (
            <div className="projectGrid projectGridV2">
              {[0, 1, 2].map((n) => (
                <div key={n} className="projectCard projectCardSkeleton" />
              ))}
            </div>
          )}

          {!loadingProjects && (
            <div className="projectGrid projectGridV2">
              {projects.map((project, index) => (
                <article
                  className={`projectCard projectCardV2 projectVariant${index % 4}`}
                  key={project.id}
                  aria-busy={busyId === project.id}
                >
                  <Link
                    className="projectCardVisual"
                    href={`/studio?project=${encodeURIComponent(project.id)}`}
                    aria-label={`Open ${project.name}`}
                  >
                    <div className="projectCardBar">
                      <span>{project.bpm}</span>
                      <small>BPM</small>
                    </div>
                    <div className="projectCardPattern">
                      {Array.from({ length: 32 }, (_, cell) => (
                        <i
                          key={cell}
                          className={
                            (cell + index * 2) % 5 === 0 ||
                            (cell + index) % 11 === 0
                              ? "on"
                              : ""
                          }
                        />
                      ))}
                    </div>
                    <span className="projectCardPlay">▶</span>
                  </Link>

                  <div className="projectCardContent">
                    <div className="projectCardTitleRow">
                      {renamingId === project.id ? (
                        <input
                          autoFocus
                          className="projectRenameInput"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => submitRename(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                        />
                      ) : (
                        <h3>{project.name}</h3>
                      )}
                      {project.role === "editor" && (
                        <span className="projectRoleTag">Shared</span>
                      )}
                      {project.isPublic && (
                        <span className="projectRoleTag isPublic">Public</span>
                      )}
                    </div>
                    <p>
                      {project.bpm} BPM · {project.bars} bars
                    </p>

                    <div className="projectCardMeta">
                      <span>{relativeDate(project.updatedAt)}</span>
                      <div className="projectCardActions">
                        <Link
                          href={`/studio?project=${encodeURIComponent(project.id)}`}
                        >
                          Open →
                        </Link>
                        {project.role === "owner" && (
                          <>
                            <button
                              onClick={() => {
                                setRenameValue(project.name);
                                setRenamingId(project.id);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              className="danger"
                              disabled={busyId === project.id}
                              onClick={() =>
                                handleDelete(project.id, project.name)
                              }
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {projects.length === 0 && (
                <button
                  className="emptyProjectCard emptyProjectCardV2"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  <span>+</span>
                  <strong>Create your first project</strong>
                  <p>
                    Start with an 8-bar house sketch and invite someone when
                    you&apos;re ready.
                  </p>
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
