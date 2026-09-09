"use client";

import { useMemo, useState } from "react";
import type {
  Clip,
  DrumVoice,
  NoteEvent,
  ProjectOperation,
  ProjectState,
  Track,
} from "@/lib/model";
import { quantize } from "@/lib/agent/music";

const DRUMS: { voice: DrumVoice; label: string; hint: string }[] = [
  { voice: "kick", label: "Kick", hint: "Low thump — the pulse of the beat" },
  { voice: "snare", label: "Snare", hint: "Cracking hit on the backbeat" },
  { voice: "clap", label: "Clap", hint: "Layered hand-clap on the backbeat" },
  { voice: "hat", label: "Hat", hint: "Short tick — adds drive" },
  { voice: "open_hat", label: "Open hat", hint: "Longer sizzle between beats" },
  { voice: "ride", label: "Ride", hint: "Bright metallic pulse" },
  { voice: "perc", label: "Perc", hint: "Extra percussion colour" },
  { voice: "shaker", label: "Shaker", hint: "Fast top-end texture" },
  { voice: "tom", label: "Tom", hint: "Tuned drum — great for fills" },
  { voice: "rim", label: "Rim", hint: "Woody click" },
];

const noteName = (note: number) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
};

type Props = {
  project: ProjectState;
  track: Track | null;
  clip: Clip | null;
  commit: (operation: ProjectOperation) => void;
};

export default function ClipEditor({ project, track, clip, commit }: Props) {
  const [velocity, setVelocity] = useState(96);
  const [duration, setDuration] = useState(1);

  const pitches = useMemo(() => {
    if (!track) return [];
    const low = /bass|sub/i.test(track.name) ? 28 : 52;
    return Array.from({ length: 27 }, (_, i) => low + 26 - i);
  }, [track]);

  if (!track || !clip) {
    return (
      <section className="panel editor emptyEditor">
        Select a clip in the arrangement — or ask the co-producer to write one.
      </section>
    );
  }

  const steps = clip.patternSteps || clip.lengthBars * 16;
  const bars = Math.max(1, Math.round(steps / 16));

  const setGroove = (patch: { swing?: number; humanize?: number }) =>
    commit({ type: "set_clip_groove", track_id: track.id, clip_id: clip.id, ...patch });

  const quantizeNotes = (grid: number) => {
    if (!clip.notes) return;
    commit({
      type: "set_clip_notes",
      track_id: track.id,
      clip_id: clip.id,
      notes: quantize(clip.notes, grid) as NoteEvent[],
    });
  };

  return (
    <section className="panel editor">
      <div className="editorHeader">
        <div>
          <p className="eyebrow">{clip.kind === "drum" ? "BEAT" : clip.kind === "notes" ? "MELODY" : "SAMPLE"}</p>
          <input
            className="clipNameInput"
            value={clip.name}
            onChange={(e) =>
              commit({
                type: "rename_clip",
                track_id: track.id,
                clip_id: clip.id,
                name: e.target.value,
              })
            }
          />
          <span className="editorClipMeta">
            {bars} bar{bars === 1 ? "" : "s"} · bar {clip.startBar + 1}
          </span>
        </div>

        <div className="editorGroove">
          <label>
            Swing
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.02}
              value={clip.swing ?? project.swing ?? 0}
              onChange={(e) => setGroove({ swing: Number(e.target.value) })}
            />
          </label>
          <label>
            Humanize
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={clip.humanize ?? 0}
              onChange={(e) => setGroove({ humanize: Number(e.target.value) })}
            />
          </label>
          {clip.kind === "notes" && (
            <div className="editorQuantize">
              <span>Snap</span>
              <button onClick={() => quantizeNotes(4)}>¼</button>
              <button onClick={() => quantizeNotes(2)}>⅛</button>
              <button onClick={() => quantizeNotes(1)}>⁄16</button>
            </div>
          )}
        </div>
      </div>

      {clip.kind === "notes" && (
        <div className="editorNoteControls">
          <label>
            Velocity
            <input
              type="number"
              min={1}
              max={127}
              value={velocity}
              onChange={(e) => setVelocity(Number(e.target.value))}
            />
          </label>
          <label>
            Length
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[1, 2, 4, 8].map((v) => (
                <option key={v} value={v}>
                  {v} step{v === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {clip.kind === "drum" && (
        <div className="gridScroll">
          <div className="drumEditor" style={{ minWidth: `${steps * 22 + 84}px` }}>
            {DRUMS.map(({ voice, label, hint }) => {
              const row = clip.drumSteps?.[voice] ?? [];
              return (
                <div className="drumEditorRow" key={voice}>
                  <span title={hint}>{label}</span>
                  <div
                    className="stepRow"
                    style={{ gridTemplateColumns: `repeat(${steps}, 1fr)` }}
                  >
                    {Array.from({ length: steps }, (_, step) => {
                      const on = Boolean(row[step]);
                      return (
                        <button
                          key={step}
                          aria-label={`${label} step ${step + 1}`}
                          className={`cell ${on ? "cellOn" : ""} ${step % 4 === 0 ? "beat" : ""} ${step % 16 === 0 ? "barStart" : ""}`}
                          onClick={() =>
                            commit({
                              type: "set_drum_step",
                              track_id: track.id,
                              clip_id: clip.id,
                              voice,
                              step,
                              enabled: !on,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {clip.kind === "notes" && (
        <div className="gridScroll">
          <div className="pianoRoll" style={{ minWidth: `${steps * 20 + 48}px` }}>
            {pitches.map((pitch) => (
              <div className="pianoRow" key={pitch}>
                <span className={`pitchLabel ${pitch % 12 === 0 ? "rootPitch" : ""}`}>
                  {noteName(pitch)}
                </span>
                <div
                  className="stepRow"
                  style={{ gridTemplateColumns: `repeat(${steps}, 1fr)` }}
                >
                  {Array.from({ length: steps }, (_, step) => {
                    const on = clip.notes?.some(
                      (n) => n.startStep === step && n.note === pitch,
                    );
                    return (
                      <button
                        key={step}
                        className={`pianoCell ${on ? "noteOn" : ""} ${step % 4 === 0 ? "beat" : ""} ${step % 16 === 0 ? "barStart" : ""}`}
                        onClick={() =>
                          commit({
                            type: "set_note_cell",
                            track_id: track.id,
                            clip_id: clip.id,
                            step,
                            note: pitch,
                            enabled: !on,
                            velocity,
                            duration_steps: duration,
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {clip.kind === "sample" && (
        <div className="gridScroll">
          <div className="sampleSteps" style={{ minWidth: `${steps * 22}px` }}>
            <div
              className="stepRow"
              style={{ gridTemplateColumns: `repeat(${steps}, 1fr)` }}
            >
              {Array.from({ length: steps }, (_, step) => {
                const on = clip.sampleTriggers?.some((t) => t.step === step);
                return (
                  <button
                    key={step}
                    className={`cell sampleCell ${on ? "cellOn" : ""} ${step % 4 === 0 ? "beat" : ""}`}
                    onClick={() =>
                      commit({
                        type: "set_sample_step",
                        track_id: track.id,
                        clip_id: clip.id,
                        step,
                        enabled: !on,
                        velocity,
                      })
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
