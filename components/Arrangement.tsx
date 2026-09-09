"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Clip, ProjectState, Track, TrackKind } from "@/lib/model";
import { trackRole } from "@/lib/agent/context";

type Range = { start: number; end: number };

type Props = {
  project: ProjectState;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  activeTrackIds?: Set<string>;
  playheadBar: number;
  selectedRange: Range | null;
  selectedSectionId: string | null;
  onSelect: (trackId: string, clipId: string | null) => void;
  onSeek: (bar: number) => void;
  onSelectRange: (range: Range | null) => void;
  onSelectSection: (id: string | null) => void;
  onAddTrack: (kind: TrackKind) => void;
  onAddClip: () => void;
  canAddClip: boolean;
  onMixer: (track: Track) => void;
  onMoveClipTo: (track: Track, clip: Clip, startBar: number) => void;
  onResizeClipTo: (track: Track, clip: Clip, lengthBars: number) => void;
  onDuplicateClip: (track: Track, clip: Clip) => void;
  onDeleteClip: (track: Track, clip: Clip) => void;
  onDeleteTrack: (track: Track) => void;
  onLoopRegion: (start: number, end: number) => void;
};

const ROLE_COLOR: Record<string, string> = {
  drums: "var(--mc-drums)",
  bass: "var(--mc-bass)",
  chords: "var(--mc-synth)",
  lead: "var(--mc-melody)",
  sampler: "var(--mc-sample)",
};
const ROLE_LABEL: Record<string, string> = {
  drums: "Beat",
  bass: "Bass",
  chords: "Chords",
  lead: "Melody",
  sampler: "Sample",
};

function density(clip: Clip): number {
  if (clip.drumSteps) {
    const t = Object.values(clip.drumSteps).reduce(
      (n, r) => n + (r?.filter(Boolean).length ?? 0),
      0,
    );
    return Math.min(1, t / (clip.lengthBars * 12));
  }
  if (clip.notes) return Math.min(1, clip.notes.length / (clip.lengthBars * 8));
  if (clip.sampleTriggers) return Math.min(1, clip.sampleTriggers.length / 8);
  return 0.2;
}

function ClipGlyph({ clip }: { clip: Clip }) {
  const cols = Math.min(64, clip.patternSteps || clip.lengthBars * 16);
  const cells = useMemo(() => {
    const out: boolean[] = [];
    for (let i = 0; i < cols; i++) {
      if (clip.drumSteps) {
        out.push(Object.values(clip.drumSteps).some((r) => r?.[i]));
      } else if (clip.notes) {
        out.push(clip.notes.some((n) => n.startStep === i));
      } else {
        out.push((clip.sampleTriggers ?? []).some((t) => t.step === i));
      }
    }
    return out;
  }, [clip, cols]);
  return (
    <span
      className="clipGlyph"
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {cells.map((on, i) => (
        <i key={i} className={on ? "on" : ""} />
      ))}
    </span>
  );
}

export default function Arrangement(props: Props) {
  const { project, playheadBar } = props;
  const [pxPerBar, setPxPerBar] = useState(64);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | { kind: "move" | "resize"; track: Track; clip: Clip; startX: number; origin: number }
    | { kind: "range"; startBar: number }
    | null
  >(null);

  useEffect(() => {
    // fit ~16 bars on first mount
    const w = laneRef.current?.clientWidth ?? 900;
    setPxPerBar(clamp(Math.round(w / Math.min(project.bars, 16)), 16, 160));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalW = project.bars * pxPerBar;

  function barFromClientX(clientX: number): number {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scroll = laneRef.current?.scrollLeft ?? 0;
    return clamp((clientX - rect.left + scroll) / pxPerBar, 0, project.bars);
  }

  function onRulerPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const bar = Math.floor(barFromClientX(e.clientX));
    dragRef.current = { kind: "range", startBar: bar };
    props.onSelectRange(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "range") {
      const bar = Math.round(barFromClientX(e.clientX));
      const start = Math.min(d.startBar, bar);
      const end = Math.max(d.startBar + 1, bar);
      if (end - start >= 1) props.onSelectRange({ start, end });
    } else if (d.kind === "move") {
      const delta = Math.round((e.clientX - d.startX) / pxPerBar);
      const to = clamp(d.origin + delta, 0, project.bars - d.clip.lengthBars);
      if (to !== d.clip.startBar) props.onMoveClipTo(d.track, d.clip, to);
    } else if (d.kind === "resize") {
      const delta = Math.round((e.clientX - d.startX) / pxPerBar);
      const len = clamp(d.origin + delta, 1, project.bars - d.clip.startBar);
      if (len !== d.clip.lengthBars) props.onResizeClipTo(d.track, d.clip, len);
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.kind === "range" && !props.selectedRange) {
      props.onSeek(Math.floor(barFromClientX(e.clientX)));
    }
  }

  const beatsPerBar = 4;
  const showBeats = pxPerBar >= 44;
  const hasSections = (project.sections ?? []).length > 0;

  return (
    <section className="arrangement">
      <div className="arrangementHead">
        <div className="arrangementTitle">
          <span>Arrangement</span>
          <small>
            {project.tracks.length} track{project.tracks.length === 1 ? "" : "s"} ·{" "}
            {project.bars} bars · {project.key} {project.scale}
          </small>
        </div>
        <div className="arrangementTools">
          <div className="zoomControl">
            <button onClick={() => setPxPerBar((z) => clamp(z - 12, 16, 160))} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => setPxPerBar((z) => clamp(z + 12, 16, 160))} aria-label="Zoom in">
              +
            </button>
          </div>
          <div className="arrangementAdd">
            <button onClick={() => props.onAddTrack("drums")}>+ Beat</button>
            <button onClick={() => props.onAddTrack("synth")}>+ Synth</button>
            <button onClick={() => props.onAddTrack("sampler")}>+ Sample</button>
            <button disabled={!props.canAddClip} onClick={props.onAddClip}>
              + Clip
            </button>
          </div>
        </div>
      </div>

      {props.selectedRange && (
        <div className="rangeBar">
          Selected bars {props.selectedRange.start + 1}–{props.selectedRange.end}
          <button
            onClick={() =>
              props.onLoopRegion(props.selectedRange!.start, props.selectedRange!.end)
            }
          >
            Loop this
          </button>
          <button onClick={() => props.onSelectRange(null)}>Clear</button>
        </div>
      )}

      <div className="arrangeGrid">
        <div className="arrangeHeaders">
          <div className="headerSpacer ruler" />
          {hasSections && <div className="headerSpacer sectionBand" />}
          {project.tracks.map((track) => {
            const role = trackRole(track);
            return (
              <div
                key={track.id}
                className={`trackHeaderRow ${track.id === props.selectedTrackId ? "isSelected" : ""}`}
                style={{ ["--track-color" as string]: ROLE_COLOR[role] ?? "var(--mc-synth)" }}
                onClick={() => props.onSelect(track.id, track.clips[0]?.id ?? null)}
              >
                <span className="trackSwatch" />
                <div className="trackHeaderText">
                  <strong>{track.name}</strong>
                  <small>{ROLE_LABEL[role] ?? track.kind}</small>
                </div>
                <div className="trackControls">
                  <button
                    className={track.mixer.muted ? "isOn" : ""}
                    title="Mute"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onMixer({ ...track, mixer: { ...track.mixer, muted: !track.mixer.muted } });
                    }}
                  >
                    M
                  </button>
                  <button
                    className={track.mixer.solo ? "isOn solo" : ""}
                    title="Solo"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onMixer({ ...track, mixer: { ...track.mixer, solo: !track.mixer.solo } });
                    }}
                  >
                    S
                  </button>
                  <button
                    className="trackRemove"
                    title="Delete track"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteTrack(track);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="timelineScroll"
          ref={laneRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="timelineInner" style={{ width: `${totalW}px` }}>
          {/* ruler */}
          <div className="ruler" onPointerDown={onRulerPointerDown}>
            {Array.from({ length: project.bars }, (_, b) => (
              <div key={b} className="rulerBar" style={{ width: `${pxPerBar}px` }}>
                <span>{b + 1}</span>
                {showBeats &&
                  Array.from({ length: beatsPerBar - 1 }, (_, i) => (
                    <i
                      key={i}
                      className="rulerBeat"
                      style={{ left: `${((i + 1) / beatsPerBar) * 100}%` }}
                    />
                  ))}
              </div>
            ))}
            {/* loop region */}
            {project.loopEnabled !== false && (
              <div
                className="loopRegion"
                style={{
                  left: `${project.loopStartBar * pxPerBar}px`,
                  width: `${(project.loopEndBar - project.loopStartBar) * pxPerBar}px`,
                }}
              />
            )}
            {/* selected range */}
            {props.selectedRange && (
              <div
                className="rangeRegion"
                style={{
                  left: `${props.selectedRange.start * pxPerBar}px`,
                  width: `${(props.selectedRange.end - props.selectedRange.start) * pxPerBar}px`,
                }}
              />
            )}
            <div
              className="playhead"
              style={{ left: `${playheadBar * pxPerBar}px` }}
            />
          </div>

          {/* sections band */}
          {(project.sections ?? []).length > 0 && (
            <div className="sectionBand">
              {project.sections.map((s) => (
                <button
                  key={s.id}
                  className={`sectionBlock ${props.selectedSectionId === s.id ? "isSelected" : ""}`}
                  style={{
                    left: `${s.startBar * pxPerBar}px`,
                    width: `${s.lengthBars * pxPerBar}px`,
                    background: `color-mix(in srgb, ${s.color ?? "#4d7bff"} 24%, transparent)`,
                    borderColor: s.color ?? "#4d7bff",
                  }}
                  onClick={() =>
                    props.onSelectSection(props.selectedSectionId === s.id ? null : s.id)
                  }
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* tracks */}
          {project.tracks.map((track) => {
            const role = trackRole(track);
            const color = ROLE_COLOR[role] ?? "var(--mc-synth)";
            const selected = track.id === props.selectedTrackId;
            const active = props.activeTrackIds?.has(track.id);
            return (
              <div
                key={track.id}
                className={`trackLaneRow ${selected ? "isSelected" : ""} ${active ? "isAgentActive" : ""}`}
                style={{ ["--track-color" as string]: color }}
              >
                <div className="trackLaneGrid">
                  {Array.from({ length: project.bars }, (_, b) => (
                    <i key={b} style={{ left: `${b * pxPerBar}px` }} />
                  ))}
                </div>
                {track.clips.map((clip) => {
                  const isSel = clip.id === props.selectedClipId;
                  return (
                    <div
                      key={clip.id}
                      className={`clipBlock ${isSel ? "isSelected" : ""}`}
                      style={{
                        left: `${clip.startBar * pxPerBar}px`,
                        width: `${clip.lengthBars * pxPerBar}px`,
                        opacity: 0.55 + density(clip) * 0.45,
                      }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest(".clipTools")) return;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        dragRef.current = {
                          kind: "move",
                          track,
                          clip,
                          startX: e.clientX,
                          origin: clip.startBar,
                        };
                        props.onSelect(track.id, clip.id);
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    >
                      <span className="clipName">{clip.name}</span>
                      <ClipGlyph clip={clip} />
                      <span
                        className="clipResize"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          dragRef.current = {
                            kind: "resize",
                            track,
                            clip,
                            startX: e.clientX,
                            origin: clip.lengthBars,
                          };
                        }}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                      />
                      {isSel && (
                        <div className="clipTools" onPointerDown={(e) => e.stopPropagation()}>
                          <button title="Duplicate" onClick={() => props.onDuplicateClip(track, clip)}>
                            ⧉
                          </button>
                          <button
                            className="clipDelete"
                            title="Delete"
                            onClick={() => props.onDeleteClip(track, clip)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
