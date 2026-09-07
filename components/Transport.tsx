"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "@/lib/model";

type Props = {
  project: ProjectState;
  connected: boolean;
  onPlay: () => void;
  onBpm: (bpm: number) => void;
  onBars: (bars: number) => void;
  onMaster: (volume: number) => void;
  onLoop: (start: number, end: number) => void;
};

export default function Transport({
  project,
  connected,
  onPlay,
  onBpm,
  onBars,
  onMaster,
  onLoop,
}: Props) {
  const [bpmDraft, setBpmDraft] = useState(String(project.bpm));
  const editingBpm = useRef(false);

  useEffect(() => {
    if (!editingBpm.current) {
      setBpmDraft(String(project.bpm));
    }
  }, [project.bpm]);

  function commitBpm() {
    editingBpm.current = false;
    const parsed = Number(bpmDraft);

    if (!Number.isFinite(parsed)) {
      setBpmDraft(String(project.bpm));
      return;
    }

    const bpm = Math.max(50, Math.min(220, Math.round(parsed)));
    setBpmDraft(String(bpm));

    if (bpm !== project.bpm) {
      onBpm(bpm);
    }
  }

  return (
    <section className="transport panel">
      <button className="play" disabled={!connected} onClick={onPlay}>
        {project.playing ? "■ STOP" : "▶ PLAY"}
      </button>

      <label className="transportField">
        <span>BPM</span>
        <input
          type="number"
          min={50}
          max={220}
          value={bpmDraft}
          onFocus={() => {
            editingBpm.current = true;
          }}
          onChange={(e) => {
            setBpmDraft(e.target.value);
          }}
          onBlur={commitBpm}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>

      <label className="transportField">
        <span>BARS</span>
        <select value={project.bars} onChange={(e) => onBars(Number(e.target.value))}>
          {[4, 8, 16, 32].map((bars) => (
            <option key={bars} value={bars}>{bars}</option>
          ))}
        </select>
      </label>

      <label className="master">
        <span>MASTER</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={project.masterVolume}
          onChange={(e) => onMaster(Number(e.target.value))}
        />
      </label>

      <label className="transportField loopField">
        <span>LOOP</span>
        <select
          value={project.loopStartBar}
          onChange={(e) =>
            onLoop(
              Number(e.target.value),
              Math.max(Number(e.target.value) + 1, project.loopEndBar),
            )
          }
        >
          {Array.from({ length: project.bars }, (_, i) => (
            <option key={i} value={i}>{i + 1}</option>
          ))}
        </select>
        <span>→</span>
        <select
          value={project.loopEndBar}
          onChange={(e) => onLoop(project.loopStartBar, Number(e.target.value))}
        >
          {Array.from({ length: project.bars }, (_, i) => i + 1)
            .filter((bar) => bar > project.loopStartBar)
            .map((bar) => (
              <option key={bar} value={bar}>{bar}</option>
            ))}
        </select>
      </label>
    </section>
  );
}
