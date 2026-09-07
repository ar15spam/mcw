"use client";

import type { Clip, ProjectState, Track } from "@/lib/model";

type Props = {
  project: ProjectState;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onSelect: (trackId: string, clipId: string | null) => void;
  onMixer: (track: Track) => void;
  onMoveClip: (track: Track, clip: Clip, delta: number) => void;
  onResizeClip: (track: Track, clip: Clip, delta: number) => void;
  onDeleteClip: (track: Track, clip: Clip) => void;
  onDeleteTrack: (track: Track) => void;
};

export default function Arrangement({
  project,
  selectedTrackId,
  selectedClipId,
  onSelect,
  onMixer,
  onMoveClip,
  onResizeClip,
  onDeleteClip,
  onDeleteTrack,
}: Props) {
  return (
    <section className="panel arrangement">
      <div className="arrangementHeader">
        <div>
          <p className="eyebrow">ARRANGEMENT</p>
          <h2>Timeline</h2>
        </div>
        <span>{project.bars} bars</span>
      </div>

      <div className="barHeader">
        <div />
        <div className="barNumbers" style={{ gridTemplateColumns: `repeat(${project.bars}, minmax(0, 1fr))` }}>
          {Array.from({ length: project.bars }, (_, i) => <span key={i}>{i + 1}</span>)}
        </div>
      </div>

      {project.tracks.map((track) => {
        const selectedTrack = track.id === selectedTrackId;
        return (
          <div className={`arrangeRow ${selectedTrack ? "selectedTrack" : ""}`} key={track.id}>
            <div className="trackMeta" onClick={() => onSelect(track.id, track.clips[0]?.id ?? null)}>
              <div>
                <strong>{track.name}</strong>
                <small>{track.kind}</small>
              </div>
              <div className="miniMixer">
                <button
                  className={track.mixer.muted ? "activeToggle" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMixer({ ...track, mixer: { ...track.mixer, muted: !track.mixer.muted } });
                  }}
                >
                  M
                </button>
                <button
                  className={track.mixer.solo ? "activeToggle solo" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMixer({ ...track, mixer: { ...track.mixer, solo: !track.mixer.solo } });
                  }}
                >
                  S
                </button>
                <button
                  className="dangerMini"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTrack(track);
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="timeline">
              {Array.from({ length: project.bars }, (_, i) => (
                <span className="barGrid" key={i} style={{ left: `${(i / project.bars) * 100}%` }} />
              ))}

              {track.clips.map((clip) => {
                const left = (clip.startBar / project.bars) * 100;
                const width = (Math.min(clip.lengthBars, project.bars - clip.startBar) / project.bars) * 100;
                const selected = clip.id === selectedClipId;

                return (
                  <div
                    key={clip.id}
                    className={`clip ${selected ? "selectedClip" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={() => onSelect(track.id, clip.id)}
                  >
                    <span>{clip.name}</span>
                    {selected && (
                      <div className="clipTools" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => onMoveClip(track, clip, -1)}>←</button>
                        <button onClick={() => onMoveClip(track, clip, 1)}>→</button>
                        <button onClick={() => onResizeClip(track, clip, -1)}>−</button>
                        <button onClick={() => onResizeClip(track, clip, 1)}>+</button>
                        <button onClick={() => onDeleteClip(track, clip)}>×</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
