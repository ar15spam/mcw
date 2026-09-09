"use client";

import { useState } from "react";
import { synthPreset } from "@/lib/default-project";
import { uploadSample } from "@/lib/api";
import type {
  ProjectOperation,
  ProjectState,
  SynthPreset,
  Track,
} from "@/lib/model";

type Props = {
  project: ProjectState;
  track: Track | null;
  commit: (operation: ProjectOperation) => void;
  canEdit?: boolean;
};

export default function InstrumentPanel({
  project,
  track,
  commit,
  canEdit = true,
}: Props) {
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");

  if (!track) return null;

  const setMixer = (patch: Partial<Track["mixer"]>) => {
    commit({
      type: "set_track_mixer",
      track_id: track.id,
      mixer: { ...track.mixer, ...patch },
    });
  };

  return (
    <section className="panel instrument">
      <div className="instrumentHeader">
        <div>
          <p className="eyebrow">TRACK</p>
          <input
            className="trackNameInput"
            value={track.name}
            onChange={(e) =>
              commit({
                type: "rename_track",
                track_id: track.id,
                name: e.target.value,
              })
            }
          />
        </div>
        <span className="kindPill">{track.kind}</span>
      </div>

      <div className="mixerControls">
        <label>
          Volume
          <input type="range" min="0" max="1" step="0.01" value={track.mixer.volume}
            onChange={(e) => setMixer({ volume: Number(e.target.value) })} />
        </label>
        <label>
          Pan
          <input type="range" min="-1" max="1" step="0.01" value={track.mixer.pan}
            onChange={(e) => setMixer({ pan: Number(e.target.value) })} />
        </label>
        <label>
          Delay
          <input type="range" min="0" max="0.8" step="0.01" value={track.mixer.delaySend}
            onChange={(e) => setMixer({ delaySend: Number(e.target.value) })} />
        </label>
        <label>
          Reverb
          <input type="range" min="0" max="0.8" step="0.01" value={track.mixer.reverbSend}
            onChange={(e) => setMixer({ reverbSend: Number(e.target.value) })} />
        </label>
      </div>

      {track.kind === "synth" && track.synth && (
        <>
          <div className="instrumentGrid">
            <label>
              Preset
              <select
                value={track.synth.preset}
                onChange={(e) =>
                  commit({
                    type: "set_synth",
                    track_id: track.id,
                    synth: synthPreset(e.target.value as SynthPreset),
                  })
                }
              >
                <option value="deep_bass">Deep Bass</option>
                <option value="acid">Acid</option>
                <option value="pad">Pad</option>
                <option value="pluck">Pluck</option>
                <option value="lead">Lead</option>
              </select>
            </label>

            <label>
              Oscillator
              <select
                value={track.synth.oscillator}
                onChange={(e) =>
                  commit({
                    type: "set_synth",
                    track_id: track.id,
                    synth: { ...track.synth!, oscillator: e.target.value as OscillatorType },
                  })
                }
              >
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="sawtooth">Saw</option>
                <option value="square">Square</option>
              </select>
            </label>

            {[
              ["Cutoff", "cutoff", 120, 8000, 10],
              ["Resonance", "resonance", 0.1, 20, 0.1],
              ["Attack", "attack", 0.002, 1, 0.002],
              ["Decay", "decay", 0.01, 1, 0.01],
              ["Sustain", "sustain", 0.01, 1, 0.01],
              ["Release", "release", 0.01, 2, 0.01],
              ["Detune", "detune", -40, 40, 1],
            ].map(([label, key, min, max, step]) => (
              <label key={String(key)}>
                {String(label)}
                <input
                  type="range"
                  min={Number(min)}
                  max={Number(max)}
                  step={Number(step)}
                  value={Number(track.synth![key as keyof typeof track.synth])}
                  onChange={(e) =>
                    commit({
                      type: "set_synth",
                      track_id: track.id,
                      synth: {
                        ...track.synth!,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}

      {track.kind === "sampler" && (
        <div className="samplerPanel">
          <label className="uploadButton" aria-disabled={uploadState === "uploading"}>
            {uploadState === "uploading" ? "Uploading…" : "Upload audio"}
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
                    cause instanceof Error
                      ? cause.message
                      : "Upload failed. Try again.",
                  );
                }
              }}
            />
          </label>

          {uploadState === "error" && (
            <p className="samplerUploadError">{uploadError}</p>
          )}

          <select
            value={track.sampleId ?? ""}
            onChange={(e) =>
              commit({
                type: "set_sampler_asset",
                track_id: track.id,
                sample_id: e.target.value || null,
              })
            }
          >
            <option value="">Choose sample</option>
            {project.samples.map((sample) => (
              <option value={sample.id} key={sample.id}>{sample.name}</option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

type OscillatorType = "sine" | "square" | "sawtooth" | "triangle";
