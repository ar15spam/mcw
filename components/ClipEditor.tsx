"use client";

import { useMemo, useState } from "react";
import type {
  Clip,
  DrumVoice,
  ProjectOperation,
  ProjectState,
  Track,
} from "@/lib/model";

const DRUMS: { voice: DrumVoice; label: string }[] = [
  { voice: "kick", label: "Kick" },
  { voice: "clap", label: "Clap" },
  { voice: "hat", label: "Hat" },
  { voice: "open_hat", label: "Open Hat" },
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
    const low = track.name.toLowerCase().includes("bass") ? 32 : 56;
    return Array.from({ length: 25 }, (_, i) => low + 24 - i);
  }, [track]);

  if (!track || !clip) {
    return (
      <section className="panel editor emptyEditor">
        Select a clip in the arrangement.
      </section>
    );
  }

  return (
    <section className="panel editor">
      <div className="editorHeader">
        <div>
          <p className="eyebrow">CLIP EDITOR</p>
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
        </div>

        <div className="editorMeta">
          {clip.kind === "notes" && (
            <>
              <label>
                Velocity
                <input
                  type="number"
                  min="1"
                  max="127"
                  value={velocity}
                  onChange={(e) => setVelocity(Number(e.target.value))}
                />
              </label>
              <label>
                Length
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[1, 2, 4, 8].map((value) => (
                    <option value={value} key={value}>{value} steps</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {clip.kind === "drum" && clip.drumSteps && (
        <div className="drumEditor">
          {DRUMS.map(({ voice, label }) => (
            <div className="drumEditorRow" key={voice}>
              <span>{label}</span>
              <div className="sixteen">
                {clip.drumSteps![voice].map((enabled, step) => (
                  <button
                    key={step}
                    className={`cell ${enabled ? "cellOn" : ""} ${step % 4 === 0 ? "beat" : ""}`}
                    onClick={() =>
                      commit({
                        type: "set_drum_step",
                        track_id: track.id,
                        clip_id: clip.id,
                        voice,
                        step,
                        enabled: !enabled,
                      })
                    }
                  >
                    {step + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {clip.kind === "notes" && (
        <div className="pianoRoll">
          <div className="pianoRollInner">
            {pitches.map((pitch) => (
              <div className="pianoRow" key={pitch}>
                <span className={`pitchLabel ${pitch % 12 === 0 ? "rootPitch" : ""}`}>
                  {noteName(pitch)}
                </span>
                <div className="sixteen">
                  {Array.from({ length: 16 }, (_, step) => {
                    const enabled = clip.notes?.some(
                      (note) => note.startStep === step && note.note === pitch,
                    );
                    return (
                      <button
                        key={step}
                        className={`pianoCell ${enabled ? "noteOn" : ""} ${step % 4 === 0 ? "beat" : ""}`}
                        onClick={() =>
                          commit({
                            type: "set_note_cell",
                            track_id: track.id,
                            clip_id: clip.id,
                            step,
                            note: pitch,
                            enabled: !enabled,
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
        <div className="sampleSteps">
          <p>Trigger the selected sample on any 16th-note step.</p>
          <div className="sixteen">
            {Array.from({ length: 16 }, (_, step) => {
              const enabled = clip.sampleTriggers?.some((trigger) => trigger.step === step);
              return (
                <button
                  key={step}
                  className={`cell sampleCell ${enabled ? "cellOn" : ""} ${step % 4 === 0 ? "beat" : ""}`}
                  onClick={() =>
                    commit({
                      type: "set_sample_step",
                      track_id: track.id,
                      clip_id: clip.id,
                      step,
                      enabled: !enabled,
                      velocity,
                    })
                  }
                >
                  {step + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
