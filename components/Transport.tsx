"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectState, ScaleName } from "@/lib/model";

type Props = {
  project: ProjectState;
  connected: boolean;
  onPlay: () => void;
  onBpm: (bpm: number) => void;
  onBars: (bars: number) => void;
  onMaster: (volume: number) => void;
  onLoop: (start: number, end: number, enabled: boolean) => void;
  onKey: (key: string) => void;
  onScale: (scale: string) => void;
  onSwing: (swing: number) => void;
};

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: ScaleName[] = [
  "minor",
  "major",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "minor_pentatonic",
  "harmonic_minor",
];

export default function Transport({
  project,
  connected,
  onPlay,
  onBpm,
  onBars,
  onMaster,
  onLoop,
  onKey,
  onScale,
  onSwing,
}: Props) {
  const [bpmDraft, setBpmDraft] = useState(String(project.bpm));
  const [barsDraft, setBarsDraft] = useState(String(project.bars));
  const editingBpm = useRef(false);
  const editingBars = useRef(false);

  useEffect(() => {
    if (!editingBpm.current) setBpmDraft(String(project.bpm));
  }, [project.bpm]);
  useEffect(() => {
    if (!editingBars.current) setBarsDraft(String(project.bars));
  }, [project.bars]);

  function commitBpm() {
    editingBpm.current = false;
    const n = Math.round(Number(bpmDraft));
    if (!Number.isFinite(n)) return setBpmDraft(String(project.bpm));
    const bpm = Math.max(40, Math.min(240, n));
    setBpmDraft(String(bpm));
    if (bpm !== project.bpm) onBpm(bpm);
  }
  function commitBars() {
    editingBars.current = false;
    const n = Math.round(Number(barsDraft));
    if (!Number.isFinite(n)) return setBarsDraft(String(project.bars));
    const bars = Math.max(1, Math.min(256, n));
    setBarsDraft(String(bars));
    if (bars !== project.bars) onBars(bars);
  }

  const loopEnabled = project.loopEnabled !== false;

  return (
    <section className="transport panel">
      <button className="play" disabled={!connected} onClick={onPlay}>
        {project.playing ? "■ Stop" : "▶ Play"}
      </button>

      <label className="transportField">
        <span>Tempo</span>
        <input
          type="number"
          min={40}
          max={240}
          value={bpmDraft}
          title="Tempo — how fast your track plays"
          onFocus={() => (editingBpm.current = true)}
          onChange={(e) => setBpmDraft(e.target.value)}
          onBlur={commitBpm}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <label className="transportField">
        <span>Bars</span>
        <input
          type="number"
          min={1}
          max={256}
          value={barsDraft}
          title="How long the whole song is"
          onFocus={() => (editingBars.current = true)}
          onChange={(e) => setBarsDraft(e.target.value)}
          onBlur={commitBars}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <label className="transportField">
        <span>Key</span>
        <select
          value={project.key ?? "A"}
          onChange={(e) => onKey(e.target.value)}
          title="The musical key the co-producer writes in"
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="transportField">
        <span>Scale</span>
        <select value={project.scale ?? "minor"} onChange={(e) => onScale(e.target.value)}>
          {SCALES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <label className="transportField transportSwing">
        <span>Swing {Math.round((project.swing ?? 0) * 100)}%</span>
        <input
          type="range"
          min={0}
          max={0.6}
          step={0.02}
          value={project.swing ?? 0}
          title="Pushes every other beat late for a bouncier feel"
          onChange={(e) => onSwing(Number(e.target.value))}
        />
      </label>

      <label className="master">
        <span>Master</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={project.masterVolume}
          onChange={(e) => onMaster(Number(e.target.value))}
        />
      </label>

      <button
        className={`transportLoop ${loopEnabled ? "isOn" : ""}`}
        title="Loop the highlighted region"
        onClick={() => onLoop(project.loopStartBar, project.loopEndBar, !loopEnabled)}
      >
        Loop {loopEnabled ? `${project.loopStartBar + 1}–${project.loopEndBar}` : "off"}
      </button>
    </section>
  );
}
