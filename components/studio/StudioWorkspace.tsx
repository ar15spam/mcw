"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Arrangement from "@/components/Arrangement";
import ClipEditor from "@/components/ClipEditor";
import InstrumentPanel from "@/components/InstrumentPanel";
import Transport from "@/components/Transport";
import SessionBar from "@/components/studio/SessionBar";
import ShareModal, { type ProjectMember } from "@/components/studio/ShareModal";
import { StudioBoot, StudioError } from "@/components/studio/StudioBoot";
import { StudioAudioEngine } from "@/lib/audio-engine";
import {
  makeDrumClip,
  makeId,
  makeNoteClip,
  makeSampleClip,
  makeTrack,
} from "@/lib/default-project";
import { exportProjectWav } from "@/lib/export-wav";
import type {
  Clip,
  ProjectOperation,
  ProjectState,
  TrackKind,
} from "@/lib/model";
import { applyOperation } from "@/lib/operations";
import { authClient } from "@/lib/auth-client";
import { createProject } from "@/lib/create-project";
import { useCollaboration } from "@/hooks/useCollaboration";

type Role = "owner" | "editor";
type ProjectMeta = {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  isPublic: boolean;
  ownerId: string;
};

const HINT_KEY = "mc_studio_hint_dismissed";

export default function StudioWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("project");
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [loadError, setLoadError] = useState<"" | "notfound" | string>("");
  const [metaLoading, setMetaLoading] = useState(true);

  const [project, setProject] = useState<ProjectState | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [toast, setToast] = useState("");
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [hintDismissed, setHintDismissed] = useState(true);

  const editingProjectName = useRef(false);
  const engineRef = useRef<StudioAudioEngine | null>(null);
  const reconciledRef = useRef(false);
  const metaRef = useRef<ProjectMeta | null>(null);

  useEffect(() => {
    engineRef.current = new StudioAudioEngine();
    return () => engineRef.current?.stop();
  }, []);

  useEffect(() => {
    try {
      setHintDismissed(localStorage.getItem(HINT_KEY) === "1");
    } catch {
      setHintDismissed(false);
    }
  }, []);

  // Load project metadata + access role from our API.
  useEffect(() => {
    if (!projectId || !session?.user) return;
    let cancelled = false;
    setMetaLoading(true);
    setLoadError("");
    reconciledRef.current = false;

    fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) throw new Error("notfound");
        if (!res.ok) throw new Error(body.error || "Could not open this project.");
        return body as {
          project: ProjectMeta;
          role: Role;
          members: ProjectMember[];
        };
      })
      .then((body) => {
        if (cancelled) return;
        setMeta(body.project);
        metaRef.current = body.project;
        setRole(body.role);
        setMembers(body.members ?? []);
        if (!editingProjectName.current) setProjectNameDraft(body.project.name);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLoadError(error.message === "notfound" ? "notfound" : error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, session?.user]);

  const receiveProject = useCallback(
    (incoming: ProjectState) => {
      setProject(incoming);
      setSelectedTrackId((current) =>
        incoming.tracks.some((track) => track.id === current)
          ? current
          : incoming.tracks[0]?.id ?? null,
      );
      if (!editingProjectName.current) setProjectNameDraft(incoming.name);
    },
    [],
  );

  const collab = useCollaboration({
    projectId,
    enabled: Boolean(session?.user && projectId && loadError === ""),
    onProject: receiveProject,
  });

  const sendOperation = collab.sendOperation;

  const commit = useCallback(
    (operation: ProjectOperation) => {
      setProject((current) =>
        current ? applyOperation(current, operation) : current,
      );
      sendOperation(operation);
    },
    [sendOperation],
  );

  // One-time reconciliation: if the project was renamed / retempo'd from the
  // dashboard while nobody had it open, push those values into the live doc.
  useEffect(() => {
    if (reconciledRef.current) return;
    if (collab.status !== "connected" || !project) return;
    const snapshot = metaRef.current;
    if (!snapshot || role !== "owner") {
      reconciledRef.current = true;
      return;
    }
    reconciledRef.current = true;
    if (snapshot.name && snapshot.name !== project.name) {
      commit({ type: "rename_project", name: snapshot.name });
    }
    if (snapshot.bpm && snapshot.bpm !== project.bpm) {
      commit({ type: "set_bpm", bpm: snapshot.bpm });
    }
    if (snapshot.bars && snapshot.bars !== project.bars) {
      commit({ type: "set_bars", bars: snapshot.bars });
    }
  }, [collab.status, project, role, commit]);

  // Keep the dashboard mirror fresh (debounced).
  useEffect(() => {
    if (!projectId || !project || collab.status !== "connected") return;
    const handle = window.setTimeout(() => {
      fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          bpm: project.bpm,
          bars: project.bars,
        }),
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(handle);
  }, [projectId, project?.name, project?.bpm, project?.bars, collab.status]);

  // Audio engine follows project state.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !project) return;
    engine.setProject(project);
    engine.syncTransport(project);
  }, [project]);

  // Keep selected clip valid.
  useEffect(() => {
    if (!project) return;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) {
      setSelectedClipId(null);
      return;
    }
    if (!track.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(track.clips[0]?.id ?? null);
    }
  }, [project, selectedTrackId, selectedClipId]);

  const selectedTrack = useMemo(
    () => project?.tracks.find((track) => track.id === selectedTrackId) ?? null,
    [project, selectedTrackId],
  );
  const selectedClip = useMemo(
    () => selectedTrack?.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [selectedTrack, selectedClipId],
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function togglePlay() {
    if (!project) return;
    void engineRef.current?.resume();
    commit({
      type: "set_playing",
      playing: !project.playing,
      start_at_ms: project.playing ? null : Date.now() + 300,
    });
  }

  function addTrack(kind: TrackKind) {
    if (!project) return;
    const track = makeTrack(kind);
    if (kind === "synth") {
      track.name = `Synth ${
        project.tracks.filter((t) => t.kind === "synth").length + 1
      }`;
    }
    commit({ type: "add_track", track });
    setSelectedTrackId(track.id);
    setSelectedClipId(track.clips[0]?.id ?? null);
  }

  function addClip() {
    if (!project || !selectedTrack) return;
    const firstOpenBar = Math.min(
      project.bars - 1,
      selectedTrack.clips.reduce(
        (max, clip) => Math.max(max, clip.startBar + clip.lengthBars),
        0,
      ),
    );

    let clip: Clip;
    if (selectedTrack.kind === "drums")
      clip = makeDrumClip("New drums", firstOpenBar, 2);
    else if (selectedTrack.kind === "sampler")
      clip = makeSampleClip("Sample clip", firstOpenBar, 2);
    else clip = makeNoteClip("MIDI clip", firstOpenBar, 2);

    commit({ type: "add_clip", track_id: selectedTrack.id, clip });
    setSelectedClipId(clip.id);
  }

  function commitProjectName() {
    editingProjectName.current = false;
    const name = projectNameDraft.trim();
    if (!name) {
      setProjectNameDraft(project?.name ?? "");
      return;
    }
    if (project && name !== project.name) {
      commit({ type: "rename_project", name });
    }
  }

  async function handleNewProject() {
    try {
      const id = await createProject();
      router.push(`/studio?project=${encodeURIComponent(id)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create project");
    }
  }

  function handleTogglePublic(next: boolean) {
    commit({ type: "set_public", is_public: next });
    if (projectId) {
      fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      }).catch(() => undefined);
    }
  }

  function dismissHint() {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // ---- Render gates -------------------------------------------------------

  if (sessionPending) return <StudioBoot label="Checking your session…" />;

  if (!session?.user) {
    return (
      <StudioError
        title="Sign in to open the studio"
        detail="Your projects and sessions live behind your account."
        action={{ label: "Sign in", href: "/login" }}
      />
    );
  }

  if (!projectId) {
    return (
      <StudioError
        title="No project selected"
        detail="Open a project from your dashboard to start making music."
        action={{ label: "Go to dashboard", href: "/dashboard" }}
      />
    );
  }

  if (loadError === "notfound") {
    return (
      <StudioError
        title="Project not found"
        detail="This project may have been deleted, or you don't have access to it."
        action={{ label: "Back to dashboard", href: "/dashboard" }}
      />
    );
  }

  if (loadError) {
    return (
      <StudioError
        title="Couldn't open this project"
        detail={loadError}
        action={{ label: "Back to dashboard", href: "/dashboard" }}
      />
    );
  }

  if (metaLoading || !meta) {
    return <StudioBoot label="Opening project…" />;
  }

  const displayName = project?.name ?? meta.name;
  const isPublic = project?.isPublic ?? meta.isPublic;
  const showConnectingOverlay = !project && collab.status !== "offline";
  const showConnectionError = !project && collab.status === "offline";

  return (
    <main className="studioShell studioShellV2">
      <nav className="studioTopNav">
        <div className="studioTopNavLeft">
          <Link
            className="studioBrand studioBrandV2"
            href="/dashboard"
            aria-label="Back to projects"
          >
            <span className="markBars studioMarkBars" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            MIDICOLLAB
          </Link>
          <span className="studioNavDivider" />
          <div className="studioProjectIdentity">
            <input
              className="projectName projectNameNav"
              value={projectNameDraft}
              aria-label="Project name"
              onFocus={() => {
                editingProjectName.current = true;
              }}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              onBlur={commitProjectName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
        </div>

        <div className="studioTopNavRight">
          <button className="studioNavButton" onClick={handleNewProject}>
            New
          </button>
          <button
            className="studioNavButton studioNavPrimary"
            onClick={() => setShowShare(true)}
          >
            Share
          </button>
          <button
            className="studioNavButton studioNavButtonWide"
            disabled={!project}
            onClick={() => project && exportProjectWav(project)}
          >
            Export
          </button>
        </div>
      </nav>

      <div className="studioWorkspace">
        <SessionBar
          status={collab.status}
          saveStatus={collab.saveStatus}
          users={collab.users}
          selfUserId={collab.self?.id ?? null}
          role={role}
          onReconnect={collab.reconnect}
        />

        {collab.error && project && (
          <div className="studioInlineWarning">
            {collab.error}
            <button onClick={collab.reconnect}>Retry</button>
          </div>
        )}

        {project && !hintDismissed && project.revision < 4 && (
          <div className="studioHint">
            <span>
              New here? Toggle a few drum steps below, press <b>Play</b>, then hit{" "}
              <b>Share</b> to invite someone.
            </span>
            <button onClick={dismissHint} aria-label="Dismiss">
              Got it
            </button>
          </div>
        )}

        {showConnectingOverlay && (
          <div className="studioConnecting">
            <span className="markBars studioMarkBars" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            <p>Connecting to “{displayName}”…</p>
          </div>
        )}

        {showConnectionError && (
          <StudioError
            title="Can't reach the studio right now"
            detail={
              collab.error ||
              "The realtime server is unavailable. Check your connection and try again."
            }
            action={{ label: "Retry", onClick: collab.reconnect }}
          />
        )}

        {project && (
          <>
            <Transport
              project={project}
              connected={Boolean(project)}
              onPlay={togglePlay}
              onBpm={(bpm) => commit({ type: "set_bpm", bpm })}
              onBars={(bars) => commit({ type: "set_bars", bars })}
              onMaster={(volume) =>
                commit({ type: "set_master_volume", volume })
              }
              onLoop={(start, end) =>
                commit({ type: "set_loop", start_bar: start, end_bar: end })
              }
            />

            <div className="studioToolbar studioToolbarV2">
              <div className="studioToolbarTitle">
                <span>Arrangement</span>
                <small>{project.tracks.length} tracks</small>
              </div>
              <div className="studioToolbarActions">
                <button onClick={() => addTrack("drums")}>+ Drums</button>
                <button onClick={() => addTrack("synth")}>+ Synth</button>
                <button onClick={() => addTrack("sampler")}>+ Sampler</button>
                <button disabled={!selectedTrack} onClick={addClip}>
                  + Clip
                </button>
              </div>
              <div className="revision">rev {project.revision}</div>
            </div>

            <Arrangement
              project={project}
              selectedTrackId={selectedTrackId}
              selectedClipId={selectedClipId}
              onSelect={(trackId, clipId) => {
                setSelectedTrackId(trackId);
                setSelectedClipId(clipId);
              }}
              onMixer={(track) =>
                commit({
                  type: "set_track_mixer",
                  track_id: track.id,
                  mixer: track.mixer,
                })
              }
              onMoveClip={(track, clip, delta) =>
                commit({
                  type: "move_clip",
                  track_id: track.id,
                  clip_id: clip.id,
                  start_bar: Math.max(
                    0,
                    Math.min(project.bars - 1, clip.startBar + delta),
                  ),
                })
              }
              onResizeClip={(track, clip, delta) =>
                commit({
                  type: "resize_clip",
                  track_id: track.id,
                  clip_id: clip.id,
                  length_bars: Math.max(1, clip.lengthBars + delta),
                })
              }
              onDeleteClip={(track, clip) =>
                commit({
                  type: "delete_clip",
                  track_id: track.id,
                  clip_id: clip.id,
                })
              }
              onDeleteTrack={(track) => {
                if (project.tracks.length <= 1) return;
                commit({ type: "delete_track", track_id: track.id });
              }}
            />

            <div className="lowerGrid lowerGridV2">
              <ClipEditor
                project={project}
                track={selectedTrack}
                clip={selectedClip}
                commit={commit}
              />
              <InstrumentPanel
                project={project}
                track={selectedTrack}
                commit={commit}
              />
            </div>
          </>
        )}
      </div>

      {showShare && (
        <ShareModal
          projectId={projectId}
          projectName={displayName}
          isPublic={isPublic}
          role={role}
          members={members}
          onClose={() => setShowShare(false)}
          onTogglePublic={handleTogglePublic}
        />
      )}

      {toast && <div className="toast studioToast">{toast}</div>}
    </main>
  );
}
