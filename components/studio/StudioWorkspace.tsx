"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Arrangement from "@/components/Arrangement";
import Transport from "@/components/Transport";
import Composer from "@/components/studio/Composer";
import ContextPanel from "@/components/studio/ContextPanel";
import CoachMarks from "@/components/studio/CoachMarks";
import StudioStarter from "@/components/studio/StudioStarter";
import StudioTopBar from "@/components/studio/StudioTopBar";
import ShareModal, { type ProjectMember } from "@/components/studio/ShareModal";
import { StudioBoot, StudioError } from "@/components/studio/StudioBoot";
import { StudioAudioEngine } from "@/lib/audio-engine";
import { makeDrumClip, makeId, makeNoteClip, makeSampleClip, makeTrack } from "@/lib/default-project";
import { exportProjectWav } from "@/lib/export-wav";
import type { Clip, ProjectOperation, ProjectState, TrackKind } from "@/lib/model";
import { applyOperation } from "@/lib/operations";
import { authClient } from "@/lib/auth-client";
import { createProject } from "@/lib/create-project";
import { useCollaboration } from "@/hooks/useCollaboration";
import { useCoproducer } from "@/hooks/useCoproducer";
import { executeToolCalls } from "@/lib/agent/executor";
import { buildSuggestions } from "@/lib/agent/suggestions";

type Role = "owner" | "editor";
type ProjectMeta = {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  isPublic: boolean;
  ownerId: string;
};

const COACH_KEY = "mc_studio_coach_dismissed";

function projectIsSilent(project: ProjectState): boolean {
  return project.tracks.every((track) =>
    track.clips.every((clip) => {
      const hits = clip.drumSteps
        ? Object.values(clip.drumSteps).some((row) => row.some(Boolean))
        : false;
      const notes = (clip.notes?.length ?? 0) > 0;
      const samples = (clip.sampleTriggers?.length ?? 0) > 0;
      return !hits && !notes && !samples;
    }),
  );
}

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
  const [nameDraft, setNameDraft] = useState("");
  const [coachDismissed, setCoachDismissed] = useState(true);
  const [activeTracks, setActiveTracks] = useState<Set<string>>(new Set());
  const [playedOnce, setPlayedOnce] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [playheadBar, setPlayheadBar] = useState(0);

  const editingName = useRef(false);
  const engineRef = useRef<StudioAudioEngine | null>(null);
  const reconciledRef = useRef(false);
  const metaRef = useRef<ProjectMeta | null>(null);
  const baselineRevision = useRef<number | null>(null);
  const activityTimer = useRef<number | undefined>(undefined);
  const starterRef = useRef(false);

  useEffect(() => {
    engineRef.current = new StudioAudioEngine();
    let raf = 0;
    const loop = () => {
      const bar = engineRef.current?.getPositionBar() ?? 0;
      setPlayheadBar(bar);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    try {
      setCoachDismissed(localStorage.getItem(COACH_KEY) === "1");
    } catch {
      setCoachDismissed(false);
    }
  }, []);

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
        return body as { project: ProjectMeta; role: Role; members: ProjectMember[] };
      })
      .then((body) => {
        if (cancelled) return;
        setMeta(body.project);
        metaRef.current = body.project;
        setRole(body.role);
        setMembers(body.members ?? []);
        if (!editingName.current) setNameDraft(body.project.name);
      })
      .catch((error: Error) => {
        if (!cancelled)
          setLoadError(error.message === "notfound" ? "notfound" : error.message);
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, session?.user]);

  const receiveProject = useCallback((incoming: ProjectState) => {
    setProject(incoming);
    if (baselineRevision.current === null)
      baselineRevision.current = incoming.revision;
    setSelectedTrackId((current) =>
      incoming.tracks.some((t) => t.id === current)
        ? current
        : incoming.tracks[0]?.id ?? null,
    );
    if (!editingName.current) setNameDraft(incoming.name);
  }, []);

  const collab = useCollaboration({
    projectId,
    enabled: Boolean(session?.user && projectId && loadError === ""),
    onProject: receiveProject,
  });

  const sendOperation = collab.sendOperation;
  const canEdit = role === "owner" || role === "editor";

  const commit = useCallback(
    (operation: ProjectOperation) => {
      setProject((current) => (current ? applyOperation(current, operation) : current));
      sendOperation(operation);
    },
    [sendOperation],
  );

  const commitBatch = useCallback(
    (operations: ProjectOperation[]) => {
      if (operations.length === 0) return;
      setProject((current) =>
        current ? operations.reduce(applyOperation, current) : current,
      );
      for (const op of operations) sendOperation(op);
    },
    [sendOperation],
  );

  const highlightTracks = useCallback((trackIds: string[]) => {
    setActiveTracks(new Set(trackIds));
    window.clearTimeout(activityTimer.current);
    activityTimer.current = window.setTimeout(() => setActiveTracks(new Set()), 2200);
  }, []);

  const getSelection = useCallback(
    () => ({
      trackId: selectedTrackId,
      clipId: selectedClipId,
      barStart: selectedRange?.start ?? null,
      barEnd: selectedRange?.end ?? null,
      sectionId: selectedSectionId,
    }),
    [selectedTrackId, selectedClipId, selectedRange, selectedSectionId],
  );

  const coproducer = useCoproducer({
    projectId,
    getSelection,
    applyOperations: commitBatch,
    onActivity: highlightTracks,
  });

  // One-time reconciliation with the dashboard mirror.
  useEffect(() => {
    if (reconciledRef.current) return;
    if (collab.status !== "connected" || !project) return;
    const snapshot = metaRef.current;
    reconciledRef.current = true;
    if (!snapshot || role !== "owner") return;
    if (snapshot.name && snapshot.name !== project.name)
      commit({ type: "rename_project", name: snapshot.name });
    if (snapshot.bpm && snapshot.bpm !== project.bpm)
      commit({ type: "set_bpm", bpm: snapshot.bpm });
    if (snapshot.bars && snapshot.bars !== project.bars)
      commit({ type: "set_bars", bars: snapshot.bars });
  }, [collab.status, project, role, commit]);

  // Apply the onboarding starter chosen on the dashboard (once).
  useEffect(() => {
    if (starterRef.current) return;
    if (collab.status !== "connected" || !project || !projectId) return;
    const starter = params.get("starter");
    if (!starter) {
      starterRef.current = true;
      return;
    }
    if (role !== "owner") return;
    starterRef.current = true;

    const selection = { trackId: selectedTrackId, clipId: selectedClipId };
    if (starter === "blank") {
      commitBatch(
        project.tracks.flatMap((t) =>
          t.clips.map(
            (c) =>
              ({
                type: "delete_clip",
                track_id: t.id,
                clip_id: c.id,
              }) as const,
          ),
        ),
      );
    } else if (starter === "describe") {
      let text = "";
      try {
        text = sessionStorage.getItem("mc_starter_describe") ?? "";
        sessionStorage.removeItem("mc_starter_describe");
      } catch {
        /* ignore */
      }
      if (text) coproducer.ask(text);
    } else {
      const { operations } = executeToolCalls(
        [{ name: "set_mood", input: { mood: starter } }],
        project,
        selection,
      );
      commitBatch(operations);
    }
    router.replace(`/studio?project=${encodeURIComponent(projectId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab.status, project, projectId, role]);

  // Debounced dashboard metadata sync.
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
    if (project.playing) setPlayedOnce(true);
  }, [project]);

  // Keep selection valid.
  useEffect(() => {
    if (!project) return;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) {
      setSelectedClipId(null);
      return;
    }
    if (!track.clips.some((c) => c.id === selectedClipId)) {
      setSelectedClipId(track.clips[0]?.id ?? null);
    }
  }, [project, selectedTrackId, selectedClipId]);

  const selectedTrack = useMemo(
    () => project?.tracks.find((t) => t.id === selectedTrackId) ?? null,
    [project, selectedTrackId],
  );
  const selectedClip = useMemo(
    () => selectedTrack?.clips.find((c) => c.id === selectedClipId) ?? null,
    [selectedTrack, selectedClipId],
  );

  const suggestions = useMemo(
    () =>
      buildSuggestions(project, {
        barStart: selectedRange?.start ?? null,
        barEnd: selectedRange?.end ?? null,
        sectionId: selectedSectionId,
      }),
    [project, selectedRange, selectedSectionId],
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function togglePlay() {
    if (!project) return;
    void engineRef.current?.resume();
    commit({
      type: "set_playing",
      playing: !project.playing,
      start_at_ms: project.playing ? null : Date.now() + 300,
      from_bar: project.playing ? undefined : project.startBar ?? 0,
    });
  }

  function seekTo(bar: number) {
    if (!project) return;
    void engineRef.current?.resume();
    commit({
      type: "set_playing",
      playing: project.playing,
      start_at_ms: project.playing ? Date.now() + 120 : null,
      from_bar: Math.max(0, Math.min(project.bars - 1, Math.floor(bar))),
    });
    if (!project.playing) setPlayheadBar(bar);
  }

  function addTrack(kind: TrackKind) {
    if (!project) return;
    const track = makeTrack(kind);
    if (kind === "synth")
      track.name = `Synth ${project.tracks.filter((t) => t.kind === "synth").length + 1}`;
    commit({ type: "add_track", track });
    setSelectedTrackId(track.id);
    setSelectedClipId(track.clips[0]?.id ?? null);
  }

  function addClip() {
    if (!project || !selectedTrack) return;
    const firstOpenBar = Math.min(
      project.bars - 1,
      selectedTrack.clips.reduce((m, c) => Math.max(m, c.startBar + c.lengthBars), 0),
    );
    let clip: Clip;
    if (selectedTrack.kind === "drums") clip = makeDrumClip("New beat", firstOpenBar, 2);
    else if (selectedTrack.kind === "sampler")
      clip = makeSampleClip("Sample clip", firstOpenBar, 2);
    else clip = makeNoteClip("New part", firstOpenBar, 2);
    commit({ type: "add_clip", track_id: selectedTrack.id, clip });
    setSelectedClipId(clip.id);
  }

  function commitName() {
    editingName.current = false;
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(project?.name ?? "");
      return;
    }
    if (project && name !== project.name) commit({ type: "rename_project", name });
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

  function handleVibe(mood: string) {
    if (!project) return;
    void engineRef.current?.resume();
    const { operations } = executeToolCalls(
      [{ name: "set_mood", input: { mood } }],
      project,
      { trackId: selectedTrackId, clipId: selectedClipId },
    );
    commitBatch(operations);
    showToast(`Building a ${mood} starter…`);
  }

  function dismissCoach() {
    setCoachDismissed(true);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // ---- render gates ------------------------------------------------------

  if (sessionPending) return <StudioBoot label="Checking your session…" />;
  if (!session?.user)
    return (
      <StudioError
        title="Sign in to open the studio"
        detail="Your projects and sessions live behind your account."
        action={{ label: "Sign in", href: "/login" }}
      />
    );
  if (!projectId)
    return (
      <StudioError
        title="No project selected"
        detail="Open a project from your dashboard to start making music."
        action={{ label: "Go to dashboard", href: "/dashboard" }}
      />
    );
  if (loadError === "notfound")
    return (
      <StudioError
        title="Project not found"
        detail="This project may have been deleted, or you don't have access to it."
        action={{ label: "Back to dashboard", href: "/dashboard" }}
      />
    );
  if (loadError)
    return (
      <StudioError
        title="Couldn't open this project"
        detail={loadError}
        action={{ label: "Back to dashboard", href: "/dashboard" }}
      />
    );
  if (metaLoading || !meta) return <StudioBoot label="Opening project…" />;

  const displayName = project?.name ?? meta.name;
  const isPublic = project?.isPublic ?? meta.isPublic;
  const showConnecting = !project && collab.status !== "offline";
  const showConnError = !project && collab.status === "offline";
  const silent = project ? projectIsSilent(project) : false;

  const coachSteps = project
    ? [
        { label: "Press Play", done: playedOnce },
        {
          label: "Change the music",
          done:
            baselineRevision.current !== null &&
            project.revision > baselineRevision.current,
        },
        {
          label: "Ask the co-producer",
          done: coproducer.messages.some((m) => m.role === "you"),
        },
        { label: "Invite someone", done: members.length > 1 || showShare },
      ]
    : [];
  const showCoach =
    !coachDismissed && project && coachSteps.some((s) => !s.done);

  return (
    <main className="studioRoot">
      <div className="studioAtmosphere" aria-hidden="true" />

      <StudioTopBar
        nameDraft={nameDraft}
        canEdit={canEdit}
        status={collab.status}
        saveStatus={collab.saveStatus}
        users={collab.users}
        selfUserId={collab.self?.id ?? null}
        role={role}
        onNameChange={setNameDraft}
        onNameCommit={commitName}
        onNameFocus={() => {
          editingName.current = true;
        }}
        onShare={() => setShowShare(true)}
        onNewProject={handleNewProject}
        onExport={() => project && exportProjectWav(project)}
        onReconnect={collab.reconnect}
      />

      <div className="studioBody">
        {collab.error && project && (
          <div className="studioInlineWarning">
            {collab.error}
            <button onClick={collab.reconnect}>Retry</button>
          </div>
        )}

        {showCoach && <CoachMarks steps={coachSteps} onDismiss={dismissCoach} />}

        {showConnecting && (
          <div className="studioConnecting">
            <span className="markBars studioMarkBars" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            <p>Connecting to “{displayName}”…</p>
          </div>
        )}

        {showConnError && (
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
              onMaster={(volume) => commit({ type: "set_master_volume", volume })}
              onLoop={(start, end, enabled) =>
                commit({ type: "set_loop", start_bar: start, end_bar: end, enabled })
              }
              onKey={(key) => commit({ type: "set_key", key })}
              onScale={(scale) => commit({ type: "set_scale", scale })}
              onSwing={(swing) => commit({ type: "set_swing", swing })}
            />

            {silent ? (
              <StudioStarter
                onVibe={handleVibe}
                onAsk={coproducer.ask}
                agentConfigured={coproducer.configured}
              />
            ) : (
              <Arrangement
                project={project}
                selectedTrackId={selectedTrackId}
                selectedClipId={selectedClipId}
                activeTrackIds={activeTracks}
                playheadBar={playheadBar}
                selectedRange={selectedRange}
                selectedSectionId={selectedSectionId}
                onSelect={(trackId, clipId) => {
                  setSelectedTrackId(trackId);
                  setSelectedClipId(clipId);
                }}
                onSeek={seekTo}
                onSelectRange={setSelectedRange}
                onSelectSection={setSelectedSectionId}
                onAddTrack={addTrack}
                onAddClip={addClip}
                canAddClip={Boolean(selectedTrack)}
                onMixer={(track) =>
                  commit({ type: "set_track_mixer", track_id: track.id, mixer: track.mixer })
                }
                onMoveClipTo={(track, clip, startBar) =>
                  commit({ type: "move_clip", track_id: track.id, clip_id: clip.id, start_bar: startBar })
                }
                onResizeClipTo={(track, clip, lengthBars) =>
                  commit({ type: "resize_clip", track_id: track.id, clip_id: clip.id, length_bars: lengthBars })
                }
                onDuplicateClip={(track, clip) => {
                  const copy = {
                    ...structuredClone(clip),
                    id: makeId("clip"),
                    startBar: clip.startBar + clip.lengthBars,
                  };
                  if (copy.startBar + clip.lengthBars > project.bars) {
                    commit({ type: "set_bars", bars: copy.startBar + clip.lengthBars });
                  }
                  commit({ type: "add_clip", track_id: track.id, clip: copy });
                }}
                onDeleteClip={(track, clip) =>
                  commit({ type: "delete_clip", track_id: track.id, clip_id: clip.id })
                }
                onDeleteTrack={(track) => {
                  if (project.tracks.length <= 1) return;
                  commit({ type: "delete_track", track_id: track.id });
                }}
                onLoopRegion={(start, end) =>
                  commit({ type: "set_loop", start_bar: start, end_bar: end, enabled: true })
                }
              />
            )}

            <ContextPanel
              project={project}
              track={selectedTrack}
              clip={selectedClip}
              commit={commit}
              canEdit={canEdit}
              selectedRange={selectedRange}
              selectedSection={
                project.sections?.find((s) => s.id === selectedSectionId) ?? null
              }
              agentMessages={coproducer.messages}
              agentSuggestions={suggestions}
              agentConfigured={coproducer.configured}
              onAsk={coproducer.ask}
            />
          </>
        )}
      </div>

      {project && (
        <Composer
          messages={coproducer.messages}
          status={coproducer.status}
          configured={coproducer.configured}
          mode={coproducer.mode}
          suggestions={suggestions}
          disabled={!canEdit || collab.status === "offline"}
          onAsk={coproducer.ask}
          onClear={coproducer.clear}
        />
      )}

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
