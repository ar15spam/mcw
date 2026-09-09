"use client";

import { useState } from "react";
import { uploadSample } from "@/lib/api";
import { synthPreset } from "@/lib/default-project";
import { readMacros, shapeSound, type SoundMacro } from "@/lib/agent/music";
import type {
  OscillatorWave,
  ProjectOperation,
  ProjectState,
  SynthPreset,
  Track,
} from "@/lib/model";

type Props = {
  project: ProjectState;
  track: Track | null;
  commit: (op: ProjectOperation) => void;
  canEdit: boolean;
};

const MACROS: { key: SoundMacro; label: string; hint: string }[] = [
  { key: "brightness", label: "Brightness", hint: "How open and trebly it sounds" },
  { key: "warmth", label: "Warmth", hint: "Rounder, softer, more analog" },
  { key: "space", label: "Space", hint: "Room and long tails around the sound" },
  { key: "movement", label: "Movement", hint: "Wobble and life in the tone" },
  { key: "energy", label: "Energy", hint: "Snappy vs. gentle" },
];

const CHARACTERS: { value: SynthPreset; label: string }[] = [
  { value: "deep_bass", label: "Deep bass" },
  { value: "sub_bass", label: "Sub bass" },
  { value: "reese_bass", label: "Reese bass" },
  { value: "acid", label: "Acid" },
  { value: "pluck", label: "Pluck" },
  { value: "lead", label: "Lead" },
  { value: "saw_lead", label: "Saw lead" },
  { value: "pad", label: "Soft pad" },
  { value: "warm_pad", label: "Warm pad" },
  { value: "organ", label: "Organ" },
  { value: "ep", label: "Electric piano" },
  { value: "stab", label: "Stab" },
  { value: "bells", label: "Bells" },
];

export default function SoundPanel({ project, track, commit, canEdit }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">(
    "idle",
  );
  const [uploadError, setUploadError] = useState("");

  if (!track) {
    return <p className="panelEmpty">Select a track to shape its sound.</p>;
  }

  if (track.kind === "drums") {
    return (
      <div className="soundPanel">
        <p className="panelEmpty">
          This is a drum track. Turn hits on and off in the beat grid, or ask the
          co-producer for a groove.
        </p>
      </div>
    );
  }

  if (track.kind === "sampler") {
    return (
      <div className="soundPanel samplerPanel">
        <label className="uploadButton" aria-disabled={uploadState === "uploading"}>
          {uploadState === "uploading" ? "Uploading…" : "Upload a sound"}
          <input
            type="file"
            accept="audio/*"
            disabled={uploadState === "uploading" || !canEdit}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 25 * 1024 * 1024) {
                setUploadState("error");
                setUploadError("Audio files must be under 25 MB.");
                return;
              }
              setUploadState("uploading");
              setUploadError("");
              try {
                const asset = await uploadSample(file, project.projectId);
                commit({ type: "add_sample_asset", asset });
                commit({
                  type: "set_sampler_asset",
                  track_id: track.id,
                  sample_id: asset.id,
                });
                setUploadState("idle");
              } catch (cause) {
                setUploadState("error");
                setUploadError(
                  cause instanceof Error ? cause.message : "Upload failed.",
                );
              }
            }}
          />
        </label>
        {uploadState === "error" && (
          <p className="samplerUploadError">{uploadError}</p>
        )}
        <label className="fieldRow">
          <span>Sound</span>
          <select
            value={track.sampleId ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              commit({
                type: "set_sampler_asset",
                track_id: track.id,
                sample_id: e.target.value || null,
              })
            }
          >
            <option value="">Choose a sample</option>
            {project.samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  const synth = track.synth;
  if (!synth) return <p className="panelEmpty">No synth on this track.</p>;

  const macroValues = readMacros(synth);

  const nudge = (macro: SoundMacro, amount: number) => {
    const next = shapeSound(synth, macro, amount);
    commit({ type: "set_synth", track_id: track.id, synth: next });
    if (macro === "space") {
      const d = amount >= 0 ? 1 : -1;
      commit({
        type: "set_track_mixer",
        track_id: track.id,
        mixer: {
          ...track.mixer,
          reverbSend: Math.max(0, Math.min(0.9, track.mixer.reverbSend + d * 0.18)),
          delaySend: Math.max(0, Math.min(0.8, track.mixer.delaySend + d * 0.1)),
        },
      });
    }
  };

  return (
    <div className="soundPanel">
      <label className="fieldRow">
        <span>Character</span>
        <select
          value={synth.preset}
          disabled={!canEdit}
          onChange={(e) =>
            commit({
              type: "set_synth",
              track_id: track.id,
              synth: synthPreset(e.target.value as SynthPreset),
            })
          }
        >
          {CHARACTERS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="macroList">
        {MACROS.map(({ key, label, hint }) => (
          <div className="macroRow" key={key} title={hint}>
            <span className="macroLabel">{label}</span>
            <div className="macroMeter" aria-hidden="true">
              <i style={{ width: `${Math.round(macroValues[key] * 100)}%` }} />
            </div>
            <div className="macroButtons">
              <button
                disabled={!canEdit}
                onClick={() => nudge(key, -0.5)}
                aria-label={`Less ${label}`}
              >
                −
              </button>
              <button
                disabled={!canEdit}
                onClick={() => nudge(key, 0.5)}
                aria-label={`More ${label}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="advancedToggle" onClick={() => setAdvanced((v) => !v)}>
        {advanced ? "Hide advanced" : "Advanced"}
      </button>

      {advanced && (
        <div className="advancedSynth">
          <label className="fieldRow">
            <span>Wave</span>
            <select
              value={synth.oscillator}
              disabled={!canEdit}
              onChange={(e) =>
                commit({
                  type: "set_synth",
                  track_id: track.id,
                  synth: {
                    ...synth,
                    oscillator: e.target.value as OscillatorWave,
                  },
                })
              }
            >
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="sawtooth">Saw</option>
              <option value="square">Square</option>
            </select>
          </label>
          {(
            [
              ["Cutoff", "cutoff", 120, 12000, 10],
              ["Resonance", "resonance", 0.1, 24, 0.1],
              ["Attack", "attack", 0.001, 2, 0.001],
              ["Decay", "decay", 0.01, 2, 0.01],
              ["Sustain", "sustain", 0.01, 1, 0.01],
              ["Release", "release", 0.01, 6, 0.01],
              ["Detune", "detune", -60, 60, 1],
            ] as const
          ).map(([label, key, min, max, step]) => (
            <label className="fieldRow slider" key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                disabled={!canEdit}
                value={Number(synth[key])}
                onChange={(e) =>
                  commit({
                    type: "set_synth",
                    track_id: track.id,
                    synth: { ...synth, [key]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
