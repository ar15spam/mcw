"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Arrangement from "@/components/Arrangement";
import ClipEditor from "@/components/ClipEditor";
import InstrumentPanel from "@/components/InstrumentPanel";
import Transport from "@/components/Transport";
import { StudioAudioEngine } from "@/lib/audio-engine";
import {
  createDefaultProject,
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
  Track,
  TrackKind,
} from "@/lib/model";
import { applyOperation } from "@/lib/operations";
import { saveProject } from "@/lib/api";
import { useCollaboration } from "@/hooks/useCollaboration";

export default function StudioPage() {
  const [project, setProject] = useState<ProjectState>(() =>
    createDefaultProject("house-demo"),
  );
  const [projectInput, setProjectInput] = useState("house-demo");
  const [username, setUsername] = useState("producer");
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>("drums");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [projectNameDraft, setProjectNameDraft] = useState("House Jam");
  const editingProjectName = useRef(false);
  const engineRef = useRef<StudioAudioEngine | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("project");
    if (fromUrl) {
      setProjectInput(fromUrl);
      setProject(createDefaultProject(fromUrl));
    }
    setUsername(`producer-${Math.floor(Math.random() * 900 + 100)}`);
    engineRef.current = new StudioAudioEngine();
    return () => engineRef.current?.stop();
  }, []);

  const receiveProject = useCallback((incoming: ProjectState) => {
    setProject(incoming);
    setSelectedTrackId((current) =>
      incoming.tracks.some((track) => track.id === current)
        ? current
        : incoming.tracks[0]?.id ?? null,
    );
  }, []);

  const collab = useCollaboration(receiveProject);

  useEffect(() => {
    if (!editingProjectName.current) {
      setProjectNameDraft(project.name);
    }
  }, [project.name]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setProject(project);
    engine.syncTransport(project);
  }, [project]);

  useEffect(() => {
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
    () => project.tracks.find((track) => track.id === selectedTrackId) ?? null,
    [project.tracks, selectedTrackId],
  );

  const selectedClip = useMemo(
    () => selectedTrack?.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [selectedTrack, selectedClipId],
  );

  const commit = useCallback(
    (operation: ProjectOperation) => {
      setProject((current) => applyOperation(current, operation));
      collab.sendOperation(operation);
    },
    [collab],
  );

  async function connect() {
    await engineRef.current?.resume();
    collab.connect(projectInput || "house-demo", username || "producer");
  }

  function togglePlay() {
    void engineRef.current?.resume();
    commit({
      type: "set_playing",
      playing: !project.playing,
      start_at_ms: project.playing ? null : Date.now() + 300,
    });
  }

  function addTrack(kind: TrackKind) {
    const track = makeTrack(kind);
    if (kind === "synth") track.name = `Synth ${project.tracks.filter((t) => t.kind === "synth").length + 1}`;
    commit({ type: "add_track", track });
    setSelectedTrackId(track.id);
    setSelectedClipId(track.clips[0]?.id ?? null);
  }

  function addClip() {
    if (!selectedTrack) return;
    const firstOpenBar = Math.min(
      project.bars - 1,
      selectedTrack.clips.reduce(
        (max, clip) => Math.max(max, clip.startBar + clip.lengthBars),
        0,
      ),
    );

    let clip: Clip;
    if (selectedTrack.kind === "drums") clip = makeDrumClip("New drums", firstOpenBar, 2);
    else if (selectedTrack.kind === "sampler") clip = makeSampleClip("Sample clip", firstOpenBar, 2);
    else clip = makeNoteClip("MIDI clip", firstOpenBar, 2);

    commit({ type: "add_clip", track_id: selectedTrack.id, clip });
    setSelectedClipId(clip.id);
  }

  async function save() {
    try {
      await saveProject(project);

      // Account/project metadata lives in Postgres. The Rust backend still owns
      // the realtime musical document, so this call is intentionally best-effort.
      void fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: project.projectId,
          name: project.name,
          bpm: project.bpm,
          bars: project.bars,
        }),
      }).catch(() => undefined);

      showToast("Saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function share() {
    const url = `${window.location.origin}/p/${encodeURIComponent(project.projectId)}`;
    await navigator.clipboard.writeText(url);
    showToast("Share link copied");
  }

  function newProject() {
    const id = `jam-${makeId("p").split("-").slice(1).join("-")}`;
    collab.disconnect();
    setProjectInput(id);
    setProject(createDefaultProject(id));
    window.history.replaceState(null, "", `/studio?project=${encodeURIComponent(id)}`);
    showToast(`Created ${id}`);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  function commitProjectName() {
    editingProjectName.current = false;
    const name = projectNameDraft.trim();

    if (!name) {
      setProjectNameDraft(project.name);
      return;
    }

    if (name !== project.name) {
      commit({ type: "rename_project", name });
    }
  }

  return (
    <main className="studioShell studioShellV2">
      <nav className="studioTopNav">
        <div className="studioTopNavLeft">
          <a className="studioBrand studioBrandV2" href="/dashboard" aria-label="Back to projects">
            <span className="markBars studioMarkBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            MIDICOLLAB
          </a>
          <span className="studioNavDivider" /><a className="studioBackLink" href="/explore">Explore</a>
          <div className="studioProjectIdentity">
            <input
              className="projectName projectNameNav"
              value={projectNameDraft}
              aria-label="Project name"
              onFocus={() => { editingProjectName.current = true; }}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              onBlur={commitProjectName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span>{project.projectId}</span>
          </div>
        </div>

        <div className="studioTopNavRight">
          <div className={`status studioStatus ${collab.status}`}>
            <span />
            {collab.status === "connected" ? "Live" : collab.status}
          </div>
          <button className="studioNavButton" onClick={newProject}>New</button>
          <button className="studioNavButton" onClick={share}>Share</button>
          <button className="studioNavButton studioNavButtonWide" onClick={() => exportProjectWav(project)}>Export</button>
          <button className="studioNavButton studioNavPrimary" onClick={save}>Save</button>
        </div>
      </nav>

      <div className="studioWorkspace">
        <section className={`studioSessionBar panel ${collab.status}`}>
          <div className="studioSessionIntro">
            <span className="sessionDot" />
            <div>
              <strong>{collab.status === "connected" ? "Collaboration live" : "Collaboration"}</strong>
              <small>{collab.status === "connected" ? `${collab.users.length} in room` : "Join this room to play and edit together"}</small>
            </div>
          </div>

          <div className="studioSessionFields">
            <label>
              <span>Room</span>
              <input
                value={projectInput}
                disabled={collab.status !== "disconnected"}
                onChange={(e) => setProjectInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              />
            </label>
            <label>
              <span>You</span>
              <input
                value={username}
                disabled={collab.status !== "disconnected"}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <button
              className={collab.status === "connected" ? "studioLeaveButton" : "studioJoinButton"}
              onClick={collab.status === "connected" ? collab.disconnect : connect}
            >
              {collab.status === "connected" ? "Leave" : collab.status === "connecting" ? "Joining..." : "Join room"}
            </button>
          </div>

          <div className="presence studioPresence">
            {collab.users.length
              ? collab.users.map((user) => (
                  <span key={user.clientId}><i>{user.username.slice(0, 1).toUpperCase()}</i>{user.username}</span>
                ))
              : <span className="studioPresenceEmpty">No one else here yet</span>}
          </div>
        </section>

        <Transport
          project={project}
          connected={collab.status === "connected"}
          onPlay={togglePlay}
          onBpm={(bpm) => commit({ type: "set_bpm", bpm })}
          onBars={(bars) => commit({ type: "set_bars", bars })}
          onMaster={(volume) => commit({ type: "set_master_volume", volume })}
          onLoop={(start, end) => commit({ type: "set_loop", start_bar: start, end_bar: end })}
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
            <button disabled={!selectedTrack} onClick={addClip}>+ Clip</button>
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
              start_bar: Math.max(0, Math.min(project.bars - 1, clip.startBar + delta)),
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
            commit({ type: "delete_clip", track_id: track.id, clip_id: clip.id })
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
          <InstrumentPanel project={project} track={selectedTrack} commit={commit} />
        </div>
      </div>

      {toast && <div className="toast studioToast">{toast}</div>}
    </main>
  );
}
