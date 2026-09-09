"use client";

import type { ProjectOperation, Track, TrackFx } from "@/lib/model";
import { defaultFx } from "@/lib/default-project";

type Props = {
  track: Track | null;
  commit: (op: ProjectOperation) => void;
  canEdit: boolean;
};

export default function MixPanel({ track, commit, canEdit }: Props) {
  if (!track) {
    return <p className="panelEmpty">Select a track to mix it.</p>;
  }

  const setMixer = (patch: Partial<Track["mixer"]>) =>
    commit({
      type: "set_track_mixer",
      track_id: track.id,
      mixer: { ...track.mixer, ...patch },
    });

  const fx: TrackFx = { ...defaultFx(), ...(track.fx ?? {}) };
  const setFx = (patch: Partial<TrackFx>) =>
    commit({ type: "set_track_fx", track_id: track.id, fx: { ...fx, ...patch } });

  return (
    <div className="mixPanel">
      <div className="mixToggles">
        <button
          className={track.mixer.muted ? "isActive" : ""}
          disabled={!canEdit}
          onClick={() => setMixer({ muted: !track.mixer.muted })}
        >
          Mute
        </button>
        <button
          className={track.mixer.solo ? "isActive solo" : ""}
          disabled={!canEdit}
          onClick={() => setMixer({ solo: !track.mixer.solo })}
        >
          Solo
        </button>
      </div>

      {(
        [
          ["Volume", "volume", 0, 1, 0.01],
          ["Pan", "pan", -1, 1, 0.01],
          ["Reverb (room)", "reverbSend", 0, 0.9, 0.01],
          ["Delay (echo)", "delaySend", 0, 0.8, 0.01],
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
            value={track.mixer[key]}
            onChange={(e) => setMixer({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}

      <div className="mixFx">
        <span className="mixFxTitle">Effects</span>
        <label className="fieldRow">
          <span>Filter</span>
          <select
            value={fx.filterType}
            disabled={!canEdit}
            onChange={(e) => setFx({ filterType: e.target.value as TrackFx["filterType"] })}
          >
            <option value="off">Off</option>
            <option value="lowpass">Low-pass (darker)</option>
            <option value="highpass">High-pass (thinner)</option>
            <option value="bandpass">Band-pass</option>
          </select>
        </label>
        {fx.filterType !== "off" && (
          <label className="fieldRow slider">
            <span>Cutoff</span>
            <input
              type="range"
              min={80}
              max={16000}
              step={20}
              disabled={!canEdit}
              value={fx.filterHz}
              onChange={(e) => setFx({ filterHz: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="fieldRow slider">
          <span>Drive (grit)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            disabled={!canEdit}
            value={fx.drive}
            onChange={(e) => setFx({ drive: Number(e.target.value) })}
          />
        </label>
        <label className="fieldRow slider">
          <span>Chorus (width)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            disabled={!canEdit}
            value={fx.chorus}
            onChange={(e) => setFx({ chorus: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
