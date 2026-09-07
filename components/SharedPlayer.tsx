"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StudioAudioEngine } from "@/lib/audio-engine";
import { exportProjectWav } from "@/lib/export-wav";
import type { ProjectState } from "@/lib/model";

type Props = {
  project: ProjectState;
};

export default function SharedPlayer({ project }: Props) {
  const engineRef = useRef<StudioAudioEngine | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    engineRef.current = new StudioAudioEngine();
    engineRef.current.setProject(project);
    return () => engineRef.current?.stop();
  }, [project]);

  async function toggle() {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.resume();

    if (playing) {
      engine.syncTransport({ ...project, playing: false, startAtMs: null });
      setPlaying(false);
    } else {
      engine.syncTransport({ ...project, playing: true, startAtMs: Date.now() + 80 });
      setPlaying(true);
    }
  }

  return (
    <main className="shareShell">
      <p className="eyebrow">SHARED PROJECT</p>
      <h1>{project.name}</h1>
      <p className="shareMeta">{project.bpm} BPM · {project.bars} bars · {project.tracks.length} tracks</p>

      <div className="shareButtons">
        <button className="play hugePlay" onClick={toggle}>{playing ? "■ STOP" : "▶ PLAY"}</button>
        <button className="secondary" onClick={() => exportProjectWav(project)}>Export WAV</button>
        <Link className="secondary linkButton" href={`/studio?project=${encodeURIComponent(project.projectId)}`}>
          Open in Studio
        </Link>
      </div>

      <section className="panel">
        <p className="eyebrow">TRACKS</p>
        <div className="shareTracks">
          {project.tracks.map((track) => (
            <div key={track.id}>
              <strong>{track.name}</strong>
              <span>{track.kind} · {track.clips.length} clip{track.clips.length === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
