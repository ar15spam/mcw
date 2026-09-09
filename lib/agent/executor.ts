import type {
  Automation,
  AutomationParam,
  Clip,
  DrumVoice,
  NoteEvent,
  ProjectOperation,
  ProjectState,
  Section,
  SectionKind,
  Track,
} from "@/lib/model";
import { applyOperation } from "@/lib/operations";
import {
  defaultFx,
  makeId,
  makeTrack,
  synthPreset,
} from "@/lib/default-project";
import { trackRole } from "@/lib/agent/context";
import type {
  AgentChange,
  AgentSelection,
  ExecutionOutput,
  ProviderToolCall,
} from "@/lib/agent/types";
import { AGENT_TOOL_NAMES } from "@/lib/agent/tools";
import * as M from "@/lib/agent/music";

type Ctx = {
  project: ProjectState;
  selection: AgentSelection;
  ops: ProjectOperation[];
  changes: AgentChange[];
  notes: string[];
  seed: number;
};

const STEPS = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function emit(ctx: Ctx, op: ProjectOperation) {
  ctx.ops.push(op);
  ctx.project = applyOperation(ctx.project, op);
}
function change(ctx: Ctx, label: string, detail?: string, track?: string) {
  ctx.changes.push({ label, detail, track });
}
function nextSeed(ctx: Ctx) {
  ctx.seed = (ctx.seed * 1664525 + 1013904223) >>> 0;
  return ctx.seed;
}

// ---------------------------------------------------------------------------
// resolving references
// ---------------------------------------------------------------------------

function selectedTrack(ctx: Ctx): Track | null {
  return ctx.project.tracks.find((t) => t.id === ctx.selection.trackId) ?? null;
}

function resolveTrack(ctx: Ctx, ref?: string | null): Track | null {
  if (!ref || /^(selected|current|this|that|it|here)$/i.test(ref.trim())) {
    return selectedTrack(ctx);
  }
  const raw = ref.trim();
  const r = raw.toLowerCase();
  const byId = ctx.project.tracks.find((t) => t.id === raw);
  if (byId) return byId;
  const byRole = ctx.project.tracks.find((t) => {
    const role = trackRole(t);
    if (role === r) return true;
    if ((r === "drums" || r === "beat" || r === "percussion") && t.kind === "drums") return true;
    if ((r === "melody" || r === "lead" || r === "arp" || r === "synth") && role === "lead") return true;
    if ((r === "chords" || r === "pad" || r === "keys" || r === "stab") && role === "chords") return true;
    if ((r === "bass" || r === "sub" || r === "low end") && role === "bass") return true;
    return false;
  });
  if (byRole) return byRole;
  return ctx.project.tracks.find((t) => t.name.toLowerCase().includes(r)) ?? null;
}

function firstOf(ctx: Ctx, role: string): Track | null {
  return ctx.project.tracks.find((t) => trackRole(t) === role) ?? null;
}
function firstDrums(ctx: Ctx): Track | null {
  return ctx.project.tracks.find((t) => t.kind === "drums") ?? null;
}
function firstSynth(ctx: Ctx): Track | null {
  return ctx.project.tracks.find((t) => t.kind === "synth" && t.synth) ?? null;
}

function key(ctx: Ctx): M.Key {
  return M.parseKey(ctx.project.key, ctx.project.scale);
}

/** the bar range the request is about: explicit selection > selected section > whole song */
function targetRange(ctx: Ctx): { start: number; end: number } {
  const sel = ctx.selection;
  if (typeof sel.barStart === "number" && typeof sel.barEnd === "number" && sel.barEnd > sel.barStart) {
    return { start: Math.max(0, Math.floor(sel.barStart)), end: Math.min(ctx.project.bars, Math.ceil(sel.barEnd)) };
  }
  const section = ctx.project.sections?.find((s) => s.id === sel.sectionId);
  if (section) return { start: section.startBar, end: section.startBar + section.lengthBars };
  return { start: 0, end: ctx.project.bars };
}

// ---------------------------------------------------------------------------
// track / clip construction
// ---------------------------------------------------------------------------

const CORE_ROLES = ["drums", "bass", "chords", "lead"] as const;

function ensureTrack(
  ctx: Ctx,
  role: (typeof CORE_ROLES)[number],
  preset?: string,
  kit?: string,
): string {
  const existing = firstOf(ctx, role);
  if (existing) return existing.id;

  let track: Track;
  if (role === "drums") {
    track = makeTrack("drums");
    track.name = "Drums";
    if (kit) track.kit = kit as Track["kit"];
    track.clips = [];
  } else {
    track = makeTrack("synth");
    track.name = role === "bass" ? "Bass" : role === "chords" ? "Chords" : "Lead";
    track.synth = synthPreset(
      (preset as never) ?? (role === "bass" ? "deep_bass" : role === "chords" ? "pad" : "lead"),
    );
    track.mixer.volume = role === "bass" ? 0.74 : role === "chords" ? 0.5 : 0.5;
    if (role === "chords") track.mixer.reverbSend = 0.24;
    track.clips = [];
  }
  track.fx = defaultFx();
  emit(ctx, { type: "add_track", track });
  return track.id;
}

function buildDrumClip(
  name: string,
  startBar: number,
  bars: number,
  grid: Partial<Record<DrumVoice, boolean[]>>,
  groove?: { swing?: number; humanize?: number },
): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "drum",
    startBar,
    lengthBars: bars,
    looped: false,
    patternSteps: bars * STEPS,
    swing: groove?.swing,
    humanize: groove?.humanize,
    drumSteps: grid,
  };
}

function buildNoteClip(
  name: string,
  startBar: number,
  bars: number,
  notes: NoteEvent[],
): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "notes",
    startBar,
    lengthBars: bars,
    looped: false,
    patternSteps: bars * STEPS,
    notes: notes.filter((n) => n.startStep < bars * STEPS),
  };
}

function clipsInRange(track: Track, start: number, end: number): Clip[] {
  return track.clips.filter(
    (c) => c.startBar < end && c.startBar + c.lengthBars > start,
  );
}

function replaceRange(ctx: Ctx, trackId: string, start: number, end: number, clip: Clip | null) {
  const track = ctx.project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  for (const c of clipsInRange(track, start, end)) {
    emit(ctx, { type: "delete_clip", track_id: trackId, clip_id: c.id });
  }
  if (clip) emit(ctx, { type: "add_clip", track_id: trackId, clip });
}

/** Clear a bar range on a track and tile a freshly-built clip across it. */
function fillRange(
  ctx: Ctx,
  trackId: string,
  start: number,
  end: number,
  clipBars: number,
  make: (bar: number, bars: number) => Clip,
) {
  const track = ctx.project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  for (const c of clipsInRange(track, start, end)) {
    emit(ctx, { type: "delete_clip", track_id: trackId, clip_id: c.id });
  }
  for (let bar = start; bar < end; bar += clipBars) {
    const bars = Math.min(clipBars, end - bar);
    emit(ctx, { type: "add_clip", track_id: trackId, clip: make(bar, bars) });
  }
}

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------

function toolSetTempo(ctx: Ctx, a: Record<string, unknown>) {
  let bpm = ctx.project.bpm;
  if (typeof a.bpm === "number") bpm = a.bpm;
  else {
    const step = a.amount === "slight" ? 4 : a.amount === "lots" ? 18 : 9;
    bpm += a.direction === "slower" ? -step : step;
  }
  bpm = clamp(Math.round(bpm), 40, 240);
  if (bpm === ctx.project.bpm) return;
  const from = ctx.project.bpm;
  emit(ctx, { type: "set_bpm", bpm });
  change(ctx, "Tempo", `${from} → ${bpm} BPM`);
}

function toolSetKey(ctx: Ctx, a: Record<string, unknown>) {
  const parsed = M.parseKey(String(a.key ?? ""), String(a.scale ?? ""));
  if (typeof a.key === "string" && /[a-g]/i.test(a.key)) {
    const root = a.key.trim().match(/^([a-g][#b]?)/i)?.[1];
    if (root) emit(ctx, { type: "set_key", key: root.toUpperCase() });
  }
  if (typeof a.scale === "string" || /minor|major|dorian|phrygian|lydian|mixo/i.test(String(a.key))) {
    emit(ctx, { type: "set_scale", scale: parsed.scaleName });
  }
  change(ctx, "Key", parsed.label);
}

function toolSetSwing(ctx: Ctx, a: Record<string, unknown>) {
  let swing = ctx.project.swing ?? 0;
  if (typeof a.amount === "number") swing = a.amount;
  else if (a.feel === "straight") swing = 0;
  else if (a.feel === "light") swing = 0.15;
  else if (a.feel === "heavy") swing = 0.4;
  else if (a.direction === "more") swing += 0.12;
  else if (a.direction === "less") swing -= 0.12;
  swing = clamp(swing, 0, 0.6);
  emit(ctx, { type: "set_swing", swing });
  change(ctx, "Swing", `${Math.round(swing * 100)}%`);
}

function toolSetName(ctx: Ctx, a: Record<string, unknown>) {
  const name = String(a.name ?? "").trim().slice(0, 80);
  if (name) {
    emit(ctx, { type: "rename_project", name });
    change(ctx, "Renamed", `"${name}"`);
  }
}

function toolSetLength(ctx: Ctx, a: Record<string, unknown>) {
  const bars = clamp(Math.round(Number(a.bars)) || ctx.project.bars, 1, 256);
  if (bars === ctx.project.bars) return;
  const from = ctx.project.bars;
  emit(ctx, { type: "set_bars", bars });
  emit(ctx, { type: "set_loop", start_bar: 0, end_bar: bars, enabled: true });
  change(ctx, "Song length", `${from} → ${bars} bars`);
}

const SECTION_KINDS: SectionKind[] = [
  "intro", "groove", "build", "breakdown", "drop", "bridge", "outro", "custom",
];

function sectionColor(kind: SectionKind): string {
  return (
    {
      intro: "#4d7bff",
      groove: "#26d0e0",
      build: "#ffb03d",
      breakdown: "#9b6dff",
      drop: "#ff5d6c",
      bridge: "#7fdb6a",
      outro: "#61656f",
      custom: "#8a8f99",
    } as Record<SectionKind, string>
  )[kind];
}

function toolCreateSection(ctx: Ctx, a: Record<string, unknown>) {
  const range = targetRange(ctx);
  let start = typeof a.start_bar === "number" ? Math.round(a.start_bar) : range.start;
  let len =
    typeof a.length_bars === "number"
      ? Math.round(a.length_bars)
      : range.end - range.start || 8;
  start = clamp(start, 0, 255);
  len = clamp(len, 1, 256 - start);
  const kind = (SECTION_KINDS.includes(a.kind as SectionKind) ? a.kind : "groove") as SectionKind;
  const name = typeof a.name === "string" && a.name ? a.name : kind[0].toUpperCase() + kind.slice(1);

  if (start + len > ctx.project.bars) {
    emit(ctx, { type: "set_bars", bars: start + len });
  }

  const section: Section = {
    id: makeId("sec"),
    name,
    kind,
    startBar: start,
    lengthBars: len,
    color: sectionColor(kind),
  };
  emit(ctx, { type: "add_section", section });

  // lightweight musical treatment of the range
  applySectionTreatment(ctx, kind, start, start + len);
  change(ctx, `Section — ${name}`, `bars ${start + 1}–${start + len}`);
}

function applySectionTreatment(ctx: Ctx, kind: SectionKind, start: number, end: number) {
  const drums = firstDrums(ctx);
  const bass = firstOf(ctx, "bass");
  if (kind === "breakdown" || kind === "intro") {
    if (drums) {
      emit(ctx, {
        type: "add_automation",
        automation: {
          id: makeId("auto"),
          trackId: drums.id,
          param: "cutoff" as AutomationParam,
          startBar: start,
          endBar: Math.min(end, start + 2),
          from: 500,
          to: kind === "intro" ? 12000 : 900,
          curve: "linear",
        },
      });
    }
    if (bass && kind === "breakdown") {
      emit(ctx, {
        type: "add_automation",
        automation: {
          id: makeId("auto"),
          trackId: bass.id,
          param: "volume",
          startBar: start,
          endBar: start + 1,
          from: bass.mixer.volume,
          to: 0.12,
          curve: "linear",
        },
      });
    }
  } else if (kind === "build") {
    if (drums) {
      emit(ctx, {
        type: "add_automation",
        automation: {
          id: makeId("auto"),
          trackId: drums.id,
          param: "cutoff",
          startBar: start,
          endBar: end,
          from: 700,
          to: 15000,
          curve: "exp",
        },
      });
      // snare-roll fill clip across the build
      const grid = M.generateFill(end - start, 0.85, nextSeed(ctx));
      replaceRange(
        ctx,
        drums.id,
        start,
        end,
        buildDrumClip("Build", start, end - start, grid),
      );
    }
  } else if (kind === "drop") {
    if (drums) emit(ctx, { type: "clear_automation", track_id: drums.id });
  }
}

function toolRenameSection(ctx: Ctx, a: Record<string, unknown>) {
  const s = ctx.project.sections?.find(
    (x) => x.id === a.section_id || x.id === ctx.selection.sectionId,
  );
  if (!s) {
    ctx.notes.push("No section selected.");
    return;
  }
  const kind = (SECTION_KINDS.includes(a.kind as SectionKind) ? a.kind : s.kind) as SectionKind;
  emit(ctx, {
    type: "update_section",
    section: {
      ...s,
      kind,
      name: typeof a.name === "string" && a.name ? a.name : s.name,
      color: sectionColor(kind),
    },
  });
  change(ctx, `Section — ${kind}`);
}

function toolDeleteSection(ctx: Ctx, a: Record<string, unknown>) {
  const id = (a.section_id as string) || ctx.selection.sectionId || "";
  if (id) {
    emit(ctx, { type: "delete_section", section_id: id });
    change(ctx, "Section removed");
  }
}

function toolAddTrack(ctx: Ctx, a: Record<string, unknown>) {
  const kind = a.kind as "drums" | "bass" | "synth" | "sampler";
  if (ctx.project.tracks.length >= 12) {
    ctx.notes.push("Lots of tracks already.");
    return;
  }
  let track: Track;
  if (kind === "bass") {
    track = makeTrack("synth", typeof a.name === "string" ? a.name : "Bass");
    track.synth = synthPreset("deep_bass");
    track.mixer.volume = 0.74;
  } else {
    track = makeTrack(
      kind === "sampler" ? "sampler" : kind === "drums" ? "drums" : "synth",
      typeof a.name === "string" ? a.name : undefined,
    );
  }
  emit(ctx, { type: "add_track", track });
  change(ctx, `${track.name} — track added`, undefined, track.id);
}

function toolRemoveTrack(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  if (!track) return ctx.notes.push("Couldn't find that track.");
  if (ctx.project.tracks.length <= 1) return ctx.notes.push("Can't remove the last track.");
  emit(ctx, { type: "delete_track", track_id: track.id });
  change(ctx, `${track.name} — removed`);
}

function drumTrackFor(ctx: Ctx, ref?: string): string | null {
  let t = resolveTrack(ctx, ref);
  if (!t || t.kind !== "drums") t = firstDrums(ctx);
  if (t) return t.id;
  return ensureTrack(ctx, "drums", undefined, "house");
}

function toolGenerateDrums(ctx: Ctx, a: Record<string, unknown>) {
  const trackId = drumTrackFor(ctx, a.track as string);
  if (!trackId) return;
  const range = targetRange(ctx);
  const clipBars = Math.max(1, Math.min(8, range.end - range.start));
  const style = (a.style as M.DrumStyle) ?? "house";
  const density = a.busyness === "sparse" ? 0.3 : a.busyness === "busy" ? 0.85 : 0.55;
  const grid = M.drumPattern({
    style,
    bars: clipBars,
    density,
    syncopation: Number(a.syncopation) || 0.35,
    fills: Boolean(a.fills),
    seed: nextSeed(ctx),
  });
  fillRange(ctx, trackId, range.start, range.end, clipBars, (bar, bars) =>
    buildDrumClip(style.replace(/_/g, " "), bar, bars, grid, {
      swing: typeof a.swing === "number" ? a.swing : undefined,
    }),
  );
  change(ctx, "Drums — new groove", style.replace(/_/g, " "), trackId);
}

function toolAdjustDensity(ctx: Ctx, a: Record<string, unknown>) {
  const trackId = drumTrackFor(ctx, a.track as string);
  const track = ctx.project.tracks.find((t) => t.id === trackId);
  const range = targetRange(ctx);
  const clip = track?.clips.find((c) => c.startBar >= range.start && c.startBar < range.end) ??
    track?.clips[0];
  if (!track || !clip?.drumSteps) return ctx.notes.push("No beat to adjust.");
  const dir = (a.direction as string) === "simpler" ? "simpler" : "busier";
  const grid: Partial<Record<DrumVoice, boolean[]>> = {};
  for (const [v, row] of Object.entries(clip.drumSteps)) {
    if (!row) continue;
    const next = [...row];
    const candidates = dir === "busier"
      ? next.map((_, i) => i).filter((i) => !next[i] && (v === "hat" ? i % 2 === 1 : i % 4 === 2))
      : next.map((_, i) => i).filter((i) => next[i] && i % 4 !== 0);
    for (let k = 0; k < 3 && candidates.length; k++) {
      const idx = candidates[Math.floor(M.mulberry32(nextSeed(ctx))() * candidates.length)];
      next[idx] = dir === "busier";
      candidates.splice(candidates.indexOf(idx), 1);
    }
    grid[v as DrumVoice] = next;
  }
  emit(ctx, {
    type: "set_clip_drum_steps",
    track_id: track.id,
    clip_id: clip.id,
    drum_steps: grid,
  });
  change(ctx, dir === "busier" ? "Drums — busier" : "Drums — simpler", undefined, track.id);
}

function toolGenerateBass(ctx: Ctx, a: Record<string, unknown>) {
  const trackId =
    resolveTrack(ctx, (a.track as string) ?? "bass")?.id ??
    firstOf(ctx, "bass")?.id ??
    ensureTrack(ctx, "bass", "deep_bass");
  const range = targetRange(ctx);
  const clipBars = Math.max(1, Math.min(8, range.end - range.start));
  const prog = M.chordProgression(
    M.PROGRESSIONS[String(a.progression)] ? String(a.progression) : "minor_loop",
    clipBars,
  );
  const notes = M.bassLine({
    key: key(ctx),
    progression: prog,
    feel: (a.feel as M.BassFeel) ?? "driving",
    octave: a.octave === "low" ? 1 : 2,
    density: a.density === "sparse" ? 0.3 : a.density === "busy" ? 0.85 : 0.55,
    seed: nextSeed(ctx),
  });
  fillRange(ctx, trackId, range.start, range.end, clipBars, (bar, bars) =>
    buildNoteClip("Bass", bar, bars, notes),
  );
  change(ctx, "Bass — new line", `${a.feel ?? "driving"}, ${key(ctx).label}`, trackId);
}

function toolGenerateChords(ctx: Ctx, a: Record<string, unknown>) {
  const trackId =
    resolveTrack(ctx, (a.track as string) ?? "chords")?.id ??
    firstOf(ctx, "chords")?.id ??
    ensureTrack(ctx, "chords", "pad");
  const range = targetRange(ctx);
  const clipBars = Math.max(1, Math.min(8, range.end - range.start));
  const progName = M.PROGRESSIONS[String(a.progression)] ? String(a.progression) : "minor_loop";
  const notes = M.chordPart({
    key: key(ctx),
    progression: M.chordProgression(progName, clipBars),
    style: (a.style as M.ChordOpts["style"]) ?? "stab",
    density: 0.6,
    seed: nextSeed(ctx),
  });
  fillRange(ctx, trackId, range.start, range.end, clipBars, (bar, bars) =>
    buildNoteClip("Chords", bar, bars, notes),
  );
  change(
    ctx,
    typeof a.progression === "string" ? "Chords" : "Chords — new part",
    progName.replace(/_/g, " "),
    trackId,
  );
}

function toolGenerateMelody(ctx: Ctx, a: Record<string, unknown>) {
  const trackId =
    resolveTrack(ctx, (a.track as string) ?? "lead")?.id ??
    firstOf(ctx, "lead")?.id ??
    ensureTrack(ctx, "lead", "lead");
  const range = targetRange(ctx);
  const clipBars = Math.max(1, Math.min(8, range.end - range.start));
  const notes = M.melodyLine({
    key: key(ctx),
    progression: M.chordProgression("minor_loop", clipBars),
    mood: (a.mood as M.MelodyMood) ?? "hook",
    density: (a.density as M.Busyness) ?? "medium",
    octave: a.octave === "low" ? 4 : 5,
    seed: nextSeed(ctx),
  });
  fillRange(ctx, trackId, range.start, range.end, clipBars, (bar, bars) =>
    buildNoteClip("Melody", bar, bars, notes),
  );
  change(ctx, "Melody — new line", `${a.mood ?? "hook"}`, trackId);
}

function toolGenerateFill(ctx: Ctx, a: Record<string, unknown>) {
  const trackId = drumTrackFor(ctx, a.track as string);
  const range = targetRange(ctx);
  const bars = Math.max(1, Math.min(2, Math.round(Number(a.bars)) || 1));
  const at = typeof a.at_bar === "number" ? Math.round(a.at_bar) : range.end - bars;
  const grid = M.generateFill(bars, Number(a.intensity) || 0.75, nextSeed(ctx));
  if (trackId) {
    replaceRange(ctx, trackId, at, at + bars, buildDrumClip("Fill", at, bars, grid));
    change(ctx, "Drum fill", `bar ${at + 1}`, trackId);
  }
}

function toolEditNotes(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? firstSynth(ctx);
  const clip =
    track?.clips.find((c) => c.id === ctx.selection.clipId) ??
    track?.clips.find((c) => c.kind === "notes");
  if (!track || !clip?.notes?.length) return ctx.notes.push("No notes to edit.");
  const max = clip.patternSteps || clip.lengthBars * STEPS;
  let notes = clip.notes.map((n) => ({ ...n }));
  const op = String(a.op ?? "");
  const applied: string[] = [];

  if (op === "transpose" || op === "octave_up" || op === "octave_down" || a.direction) {
    const semis =
      op === "octave_up" || (a.direction === "up" && a.amount === "octave")
        ? 12
        : op === "octave_down" || (a.direction === "down" && a.amount === "octave")
          ? -12
          : (a.direction === "down" ? -1 : 1) * (Number(a.semitones) || 2);
    notes = M.transposeNotes(notes, semis);
    applied.push(semis > 0 ? `up ${Math.abs(semis)}` : `down ${Math.abs(semis)}`);
  }
  if (op === "quantize" || a.quantize) {
    notes = M.quantize(notes, Number(a.grid) || 2);
    applied.push("quantized");
  }
  if (op === "humanize" || a.humanize) {
    notes = M.humanize(notes, Number(a.humanize) || 0.4, max);
    applied.push("humanized");
  }
  if (op === "thin" || a.direction === "sparser") {
    notes = notes.filter((_, i) => i % 2 === 0);
    applied.push("thinned");
  }
  if (op === "double") {
    const extra = notes.map((n) => ({
      ...n,
      id: makeId("note"),
      startStep: Math.min(max - 1, n.startStep + Math.round(n.durationSteps / 2)),
    }));
    notes = [...notes, ...extra];
    applied.push("doubled");
  }

  emit(ctx, {
    type: "set_clip_notes",
    track_id: track.id,
    clip_id: clip.id,
    notes,
  });
  change(ctx, `${track.name} — notes`, applied.join(", ") || "edited", track.id);
}

function toolMoveClip(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  const clip =
    track?.clips.find((c) => c.id === ctx.selection.clipId) ?? track?.clips[0];
  if (!track || !clip) return ctx.notes.push("No clip to move.");
  const to =
    typeof a.to_bar === "number"
      ? Math.round(a.to_bar)
      : clip.startBar + (a.direction === "left" ? -1 : 1) * (Number(a.bars) || 1);
  emit(ctx, { type: "move_clip", track_id: track.id, clip_id: clip.id, start_bar: Math.max(0, to) });
  change(ctx, `${clip.name} — moved`, `bar ${Math.max(0, to) + 1}`, track.id);
}

function toolResizeClip(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  const clip = track?.clips.find((c) => c.id === ctx.selection.clipId) ?? track?.clips[0];
  if (!track || !clip) return;
  const len = typeof a.length_bars === "number" ? Math.round(a.length_bars) : clip.lengthBars;
  emit(ctx, { type: "resize_clip", track_id: track.id, clip_id: clip.id, length_bars: Math.max(1, len) });
  change(ctx, `${clip.name} — resized`, `${Math.max(1, len)} bars`, track.id);
}

function toolDuplicateClip(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  const clip = track?.clips.find((c) => c.id === ctx.selection.clipId) ?? track?.clips[0];
  if (!track || !clip) return ctx.notes.push("No clip to duplicate.");
  const at =
    typeof a.at_bar === "number" ? Math.round(a.at_bar) : clip.startBar + clip.lengthBars;
  const copy: Clip = { ...structuredClone(clip), id: makeId("clip"), startBar: Math.max(0, at) };
  if (at + clip.lengthBars > ctx.project.bars) {
    emit(ctx, { type: "set_bars", bars: at + clip.lengthBars });
  }
  emit(ctx, { type: "add_clip", track_id: track.id, clip: copy });
  change(ctx, `${clip.name} — duplicated`, `bar ${at + 1}`, track.id);
}

function toolClipVariation(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  const clip = track?.clips.find((c) => c.id === ctx.selection.clipId) ?? track?.clips[0];
  if (!track || !clip) return ctx.notes.push("No clip to vary.");
  const at =
    typeof a.at_bar === "number" ? Math.round(a.at_bar) : clip.startBar + clip.lengthBars;
  const r = M.mulberry32(nextSeed(ctx));
  const copy: Clip = { ...structuredClone(clip), id: makeId("clip"), startBar: Math.max(0, at), name: `${clip.name} v2` };

  if (copy.drumSteps) {
    for (const row of Object.values(copy.drumSteps)) {
      if (!row) continue;
      for (let i = 0; i < row.length; i++) {
        if (r() < 0.14) row[i] = !row[i];
      }
    }
  } else if (copy.notes) {
    copy.notes = copy.notes.map((n) => ({
      ...n,
      id: makeId("note"),
      note: r() < 0.35 ? clamp(n.note + (r() < 0.5 ? 2 : -2), 0, 127) : n.note,
      velocity: clamp(n.velocity + Math.round((r() * 2 - 1) * 14), 1, 127),
    }));
    if (r() < 0.5 && copy.notes.length > 3) copy.notes.splice(Math.floor(r() * copy.notes.length), 1);
  }

  if (at + clip.lengthBars > ctx.project.bars) emit(ctx, { type: "set_bars", bars: at + clip.lengthBars });
  emit(ctx, { type: "add_clip", track_id: track.id, clip: copy });
  change(ctx, `${clip.name} — variation`, `bar ${at + 1}`, track.id);
}

function toolDeleteClip(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  const clip = track?.clips.find((c) => c.id === ctx.selection.clipId) ?? track?.clips[0];
  if (track && clip) {
    emit(ctx, { type: "delete_clip", track_id: track.id, clip_id: clip.id });
    change(ctx, `${clip.name} — deleted`, undefined, track.id);
  }
}

const MACROS: M.SoundMacro[] = ["brightness", "warmth", "space", "movement", "energy"];
const MACRO_WORDS: Record<M.SoundMacro, [string, string]> = {
  brightness: ["brighter", "darker"],
  warmth: ["warmer", "cooler"],
  space: ["more space", "tighter"],
  movement: ["more movement", "steadier"],
  energy: ["snappier", "softer"],
};

function toolShapeSound(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? firstSynth(ctx);
  if (!track?.synth) return ctx.notes.push("That track has no synth tone.");
  let synth = track.synth;
  const touched: string[] = [];
  for (const macro of MACROS) {
    const raw = a[macro];
    if (typeof raw !== "number" || raw === 0) continue;
    synth = M.shapeSound(synth, macro, clamp(raw, -1, 1));
    touched.push(MACRO_WORDS[macro][raw < 0 ? 1 : 0]);
  }
  if (!touched.length) return;
  emit(ctx, { type: "set_synth", track_id: track.id, synth });
  change(ctx, `${track.name} — tone`, touched.join(", "), track.id);
}

function toolSetInstrument(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? firstSynth(ctx);
  const preset = String(a.character ?? a.preset ?? "");
  if (!track?.synth) return ctx.notes.push("No synth track.");
  emit(ctx, { type: "set_synth", track_id: track.id, synth: synthPreset(preset as never) });
  change(ctx, `${track.name} — sound`, preset.replace(/_/g, " "), track.id);
}

function toolSetKit(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? firstDrums(ctx);
  if (!track || track.kind !== "drums") return ctx.notes.push("No drum track.");
  const kit = String(a.kit ?? "house");
  emit(ctx, { type: "set_track_kit", track_id: track.id, kit: kit as Track["kit"] & string });
  change(ctx, `${track.name} — kit`, kit, track.id);
}

function toolTrackFx(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? selectedTrack(ctx) ?? firstSynth(ctx);
  if (!track) return ctx.notes.push("No track selected.");
  const fx = { ...defaultFx(), ...(track.fx ?? {}) };
  const touched: string[] = [];
  if (typeof a.filter === "string" && ["off", "lowpass", "highpass", "bandpass"].includes(a.filter)) {
    fx.filterType = a.filter as never;
    touched.push(a.filter === "off" ? "filter off" : `${a.filter} filter`);
  }
  if (typeof a.filter_hz === "number") {
    fx.filterHz = clamp(a.filter_hz, 40, 18000);
    if (fx.filterType === "off") fx.filterType = "lowpass";
    touched.push(`${Math.round(fx.filterHz)}Hz`);
  }
  if (typeof a.drive === "number") {
    fx.drive = clamp(a.drive, 0, 1);
    touched.push(a.drive > (track.fx?.drive ?? 0) ? "more drive" : "less drive");
  }
  if (typeof a.chorus === "number") {
    fx.chorus = clamp(a.chorus, 0, 1);
    touched.push("chorus");
  }
  if (typeof a.resonance === "number") fx.resonance = clamp(a.resonance, 0, 24);
  if (!touched.length) return;
  emit(ctx, { type: "set_track_fx", track_id: track.id, fx });
  change(ctx, `${track.name} — fx`, touched.join(", "), track.id);
}

function levelToVol(level: string): number {
  return { mute: 0, quiet: 0.35, normal: 0.7, loud: 0.92 }[level] ?? 0.7;
}
function toolSetLevel(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  if (!track) return ctx.notes.push("Couldn't find that track.");
  let volume = track.mixer.volume;
  let muted = track.mixer.muted;
  if (typeof a.level === "string") {
    if (a.level === "mute") muted = true;
    else {
      muted = false;
      volume = levelToVol(a.level);
    }
  } else if (a.direction === "up") {
    volume = clamp(volume + 0.16, 0, 1);
    muted = false;
  } else if (a.direction === "down") volume = clamp(volume - 0.16, 0, 1);
  emit(ctx, {
    type: "set_track_mixer",
    track_id: track.id,
    mixer: { ...track.mixer, volume, muted },
  });
  change(ctx, `${track.name} — ${muted ? "muted" : "level"}`, muted ? undefined : `${Math.round(volume * 100)}%`, track.id);
}

function toolSetState(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string);
  if (!track) return ctx.notes.push("Couldn't find that track.");
  const mixer = { ...track.mixer };
  if (typeof a.mute === "boolean") mixer.muted = a.mute;
  if (typeof a.solo === "boolean") mixer.solo = a.solo;
  emit(ctx, { type: "set_track_mixer", track_id: track.id, mixer });
  change(ctx, `${track.name} — ${mixer.solo ? "soloed" : mixer.muted ? "muted" : "on"}`, undefined, track.id);
}

function toolSetReverb(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? firstSynth(ctx);
  if (!track) return;
  const amount = String(a.amount ?? "more");
  const mixer = { ...track.mixer };
  if (amount === "none") {
    mixer.reverbSend = 0;
  } else {
    mixer.reverbSend = clamp(mixer.reverbSend + (amount === "more" ? 0.28 : -0.24), 0, 0.9);
    mixer.delaySend = clamp(mixer.delaySend + (amount === "more" ? 0.12 : -0.12), 0, 0.8);
  }
  emit(ctx, { type: "set_track_mixer", track_id: track.id, mixer });
  change(ctx, `${track.name} — space`, amount, track.id);
}

const AUTO_PARAMS: AutomationParam[] = ["volume", "cutoff", "reverb", "delay", "drive", "pan"];
function toolAutomate(ctx: Ctx, a: Record<string, unknown>) {
  const track = resolveTrack(ctx, a.track as string) ?? selectedTrack(ctx) ?? firstSynth(ctx);
  if (!track) return ctx.notes.push("No track selected.");
  let param = String(a.param ?? "cutoff") as AutomationParam;
  if (/filter|cutoff|bright/i.test(String(a.param))) param = "cutoff";
  if (!AUTO_PARAMS.includes(param)) param = "cutoff";
  const range = targetRange(ctx);
  const startBar = typeof a.start_bar === "number" ? Math.round(a.start_bar) : range.start;
  const endBar = typeof a.end_bar === "number" ? Math.round(a.end_bar) : range.end;

  const dir = String(a.direction ?? "open");
  let from = Number(a.from);
  let to = Number(a.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    if (param === "cutoff") {
      from = /open|up|rise/i.test(dir) ? 500 : 15000;
      to = /open|up|rise/i.test(dir) ? 15000 : 500;
    } else if (param === "volume") {
      from = /up|rise|in/i.test(dir) ? 0.1 : track.mixer.volume;
      to = /up|rise|in/i.test(dir) ? track.mixer.volume : 0.1;
    } else {
      from = /up|more|rise/i.test(dir) ? 0 : 0.7;
      to = /up|more|rise/i.test(dir) ? 0.7 : 0;
    }
  }
  const automation: Automation = {
    id: makeId("auto"),
    trackId: track.id,
    param,
    startBar: Math.max(0, startBar),
    endBar: Math.max(startBar + 1, endBar),
    from,
    to,
    curve: /exp|fast/i.test(String(a.curve)) ? "exp" : "linear",
  };
  emit(ctx, { type: "add_automation", automation });
  change(
    ctx,
    `${track.name} — automation`,
    `${param} ${dir} · bars ${automation.startBar + 1}–${automation.endBar}`,
    track.id,
  );
}

// ---------------------------------------------------------------------------
// mood + energy (composites)
// ---------------------------------------------------------------------------

function toolSetMood(ctx: Ctx, a: Record<string, unknown>) {
  const mood = M.resolveMood(a.mood as string);
  const k = M.parseKey(mood.key, mood.scale);
  emit(ctx, { type: "set_bpm", bpm: clamp(mood.bpm, 40, 240) });
  emit(ctx, { type: "set_key", key: mood.key });
  emit(ctx, { type: "set_scale", scale: mood.scale });
  emit(ctx, { type: "set_swing", swing: mood.swing });

  const bars = Math.min(8, ctx.project.bars);
  const prog = M.chordProgression(mood.progression, bars);

  const drumsId = drumTrackFor(ctx);
  if (drumsId) {
    emit(ctx, { type: "set_track_kit", track_id: drumsId, kit: mood.drumKit as never });
    const grid = M.drumPattern({ style: mood.drumStyle, bars, density: 0.6, seed: nextSeed(ctx) });
    replaceRange(ctx, drumsId, 0, bars, buildDrumClip(mood.label, 0, bars, grid, { swing: mood.swing }));
  }

  const bassId = firstOf(ctx, "bass")?.id ?? ensureTrack(ctx, "bass", mood.bassPreset);
  emit(ctx, { type: "set_synth", track_id: bassId, synth: synthPreset(mood.bassPreset as never) });
  replaceRange(
    ctx, bassId, 0, bars,
    buildNoteClip("Bass", 0, bars, M.bassLine({ key: k, progression: prog, feel: mood.bassFeel, seed: nextSeed(ctx) })),
  );

  const chordsId = firstOf(ctx, "chords")?.id ?? ensureTrack(ctx, "chords", mood.chordPreset);
  emit(ctx, { type: "set_synth", track_id: chordsId, synth: synthPreset(mood.chordPreset as never) });
  replaceRange(
    ctx, chordsId, 0, bars,
    buildNoteClip("Chords", 0, bars, M.chordPart({ key: k, progression: prog, style: mood.chordStyle, seed: nextSeed(ctx) })),
  );

  const leadTrack = firstOf(ctx, "lead");
  if (leadTrack) {
    emit(ctx, { type: "set_synth", track_id: leadTrack.id, synth: synthPreset(mood.leadPreset as never) });
    replaceRange(
      ctx, leadTrack.id, 0, bars,
      buildNoteClip("Lead", 0, bars, M.melodyLine({ key: k, progression: prog, mood: mood.leadMood, density: "medium", seed: nextSeed(ctx) })),
    );
  }

  change(ctx, `Recast as "${mood.label}"`, `${mood.bpm} BPM · ${k.label}`);
}

function toolSetEnergy(ctx: Ctx, a: Record<string, unknown>) {
  const up = a.direction !== "less";
  const amt = a.amount === "slight" ? 1 : a.amount === "lots" ? 3 : 2;
  emit(ctx, { type: "set_bpm", bpm: clamp(ctx.project.bpm + amt * 4 * (up ? 1 : -1), 40, 240) });
  toolAdjustDensity(ctx, { direction: up ? "busier" : "simpler" });
  for (const track of ctx.project.tracks) {
    if (track.kind === "synth" && track.synth && trackRole(track) !== "bass") {
      emit(ctx, {
        type: "set_synth",
        track_id: track.id,
        synth: M.shapeSound(track.synth, "brightness", (up ? 0.3 : -0.3) * amt),
      });
    }
  }
  change(ctx, up ? "More energy" : "Less energy", "tempo · drums · tone");
}

// ---------------------------------------------------------------------------
// arrange_song — the full arrangement builder
// ---------------------------------------------------------------------------

function toolArrangeSong(ctx: Ctx, a: Record<string, unknown>) {
  const mood = M.resolveMood((a.mood as string) ?? (a.style as string));
  const bars = clamp(Math.round(Number(a.bars)) || 32, 8, 128);
  const bpm = clamp(Math.round(Number(a.bpm)) || mood.bpm, 40, 240);
  const keyName = typeof a.key === "string" && /[a-g]/i.test(a.key) ? a.key : mood.key;
  const k = M.parseKey(keyName, (a.scale as string) ?? mood.scale);
  const swing = typeof a.swing === "number" ? clamp(a.swing, 0, 0.6) : mood.swing;
  const progName = M.PROGRESSIONS[String(a.progression)] ? String(a.progression) : mood.progression;

  // ---- reset transport + theory ----
  emit(ctx, { type: "set_bpm", bpm });
  emit(ctx, { type: "set_bars", bars });
  emit(ctx, { type: "set_loop", start_bar: 0, end_bar: bars, enabled: true });
  emit(ctx, { type: "set_key", key: k.label.split(" ")[0] });
  emit(ctx, { type: "set_scale", scale: k.scaleName });
  emit(ctx, { type: "set_swing", swing });
  if (typeof a.name === "string" && a.name) emit(ctx, { type: "rename_project", name: a.name });

  // ---- clean slate ----
  for (const s of [...ctx.project.sections]) emit(ctx, { type: "delete_section", section_id: s.id });
  for (const t of ctx.project.tracks) emit(ctx, { type: "clear_automation", track_id: t.id });

  const drumsId = ensureTrack(ctx, "drums", undefined, mood.drumKit);
  const bassId = ensureTrack(ctx, "bass", mood.bassPreset);
  const chordsId = ensureTrack(ctx, "chords", mood.chordPreset);
  const leadId = ensureTrack(ctx, "lead", mood.leadPreset);
  emit(ctx, { type: "set_track_kit", track_id: drumsId, kit: mood.drumKit as never });
  emit(ctx, { type: "set_synth", track_id: bassId, synth: synthPreset(mood.bassPreset as never) });
  emit(ctx, { type: "set_synth", track_id: chordsId, synth: synthPreset(mood.chordPreset as never) });
  emit(ctx, { type: "set_synth", track_id: leadId, synth: synthPreset(mood.leadPreset as never) });
  for (const id of [drumsId, bassId, chordsId, leadId]) {
    for (const c of ctx.project.tracks.find((t) => t.id === id)!.clips) {
      emit(ctx, { type: "delete_clip", track_id: id, clip_id: c.id });
    }
  }

  // ---- sections ----
  let plan: M.SectionPlan[] = M.sectionTemplate(bars);
  if (Array.isArray(a.sections) && a.sections.length) {
    plan = (a.sections as Array<Record<string, unknown>>)
      .map((s) => ({
        kind: (SECTION_KINDS.includes(s.kind as SectionKind) ? s.kind : "groove") as SectionKind,
        bars: clamp(Math.round(Number(s.bars)) || 8, 1, 64),
        energy: typeof s.energy === "number" ? clamp(s.energy, 0, 1) : 0.6,
      }))
      .slice(0, 16);
  }
  // fit plan to total bars
  let total = plan.reduce((n, s) => n + s.bars, 0);
  if (total !== bars && plan.length) {
    const scale = bars / total;
    plan = plan.map((s) => ({ ...s, bars: Math.max(1, Math.round(s.bars * scale)) }));
    total = plan.reduce((n, s) => n + s.bars, 0);
    plan[plan.length - 1].bars += bars - total;
    if (plan[plan.length - 1].bars < 1) plan[plan.length - 1].bars = 1;
  }

  let cursor = 0;
  for (const sec of plan) {
    const secBars = Math.min(sec.bars, bars - cursor);
    if (secBars <= 0) break;
    const clipBars = Math.min(8, secBars);
    const seedBase = nextSeed(ctx);

    emit(ctx, {
      type: "add_section",
      section: {
        id: makeId("sec"),
        name: sec.kind[0].toUpperCase() + sec.kind.slice(1),
        kind: sec.kind,
        startBar: cursor,
        lengthBars: secBars,
        color: sectionColor(sec.kind),
      },
    });

    const e = sec.energy;
    const prog = M.chordProgression(progName, clipBars);

    // drums — present unless very low energy intro
    if (e > 0.2) {
      const grid = M.drumPattern({
        style: sec.kind === "breakdown" ? "minimal" : mood.drumStyle,
        bars: clipBars,
        density: sec.kind === "breakdown" ? 0.25 : clamp(0.3 + e * 0.6, 0.2, 0.95),
        syncopation: 0.3 + e * 0.3,
        fills: sec.kind === "build" || sec.kind === "groove",
        seed: seedBase + 1,
      });
      tile(ctx, drumsId, cursor, secBars, clipBars, (bar) =>
        buildDrumClip(`${sec.kind} beat`, bar, Math.min(clipBars, cursor + secBars - bar), grid, { swing }),
      );
    }

    // bass — from groove onward, sparser in breakdown
    if (e > 0.3 && sec.kind !== "intro") {
      const notes = M.bassLine({
        key: k,
        progression: prog,
        feel: sec.kind === "breakdown" ? "sub" : mood.bassFeel,
        density: clamp(0.3 + e * 0.5, 0.2, 0.9),
        seed: seedBase + 2,
      });
      tile(ctx, bassId, cursor, secBars, clipBars, (bar) =>
        buildNoteClip("Bass", bar, Math.min(clipBars, cursor + secBars - bar), notes),
      );
    }

    // chords — everywhere except maybe drop of pure techno
    {
      const notes = M.chordPart({
        key: k,
        progression: prog,
        style: sec.kind === "breakdown" || sec.kind === "intro" ? "pad" : mood.chordStyle,
        density: clamp(0.3 + e * 0.4, 0.2, 0.85),
        seed: seedBase + 3,
      });
      tile(ctx, chordsId, cursor, secBars, clipBars, (bar) =>
        buildNoteClip("Chords", bar, Math.min(clipBars, cursor + secBars - bar), notes),
      );
    }

    // lead — groove / drop / bridge only
    if (["groove", "drop", "bridge", "breakdown"].includes(sec.kind) && e > 0.4) {
      const notes = M.melodyLine({
        key: k,
        progression: prog,
        mood: sec.kind === "breakdown" ? "dreamy" : mood.leadMood,
        density: e > 0.8 ? "busy" : "medium",
        seed: seedBase + 4,
      });
      tile(ctx, leadId, cursor, secBars, clipBars, (bar) =>
        buildNoteClip("Lead", bar, Math.min(clipBars, cursor + secBars - bar), notes),
      );
    }

    // energy automation
    if (sec.kind === "build") {
      emit(ctx, {
        type: "add_automation",
        automation: { id: makeId("auto"), trackId: drumsId, param: "cutoff", startBar: cursor, endBar: cursor + secBars, from: 800, to: 16000, curve: "exp" },
      });
    } else if (sec.kind === "intro") {
      emit(ctx, {
        type: "add_automation",
        automation: { id: makeId("auto"), trackId: chordsId, param: "cutoff", startBar: cursor, endBar: cursor + secBars, from: 700, to: 6000, curve: "linear" },
      });
    }

    cursor += secBars;
  }

  change(
    ctx,
    `Arranged "${mood.label}"`,
    `${bars} bars · ${bpm} BPM · ${k.label} · ${plan.map((s) => s.kind).join(" → ")}`,
  );
}

/** lay a generated clip repeatedly across a section's bars */
function tile(
  ctx: Ctx,
  trackId: string,
  start: number,
  bars: number,
  clipBars: number,
  make: (bar: number) => Clip,
) {
  for (let bar = start; bar < start + bars; bar += clipBars) {
    emit(ctx, { type: "add_clip", track_id: trackId, clip: make(bar) });
  }
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

const DISPATCH: Record<string, (ctx: Ctx, a: Record<string, unknown>) => void> = {
  set_tempo: toolSetTempo,
  set_key: toolSetKey,
  set_scale: toolSetKey,
  set_swing: toolSetSwing,
  set_project_name: toolSetName,
  set_song_length: toolSetLength,
  create_section: toolCreateSection,
  update_section: toolRenameSection,
  delete_section: toolDeleteSection,
  add_track: toolAddTrack,
  remove_track: toolRemoveTrack,
  generate_drum_pattern: toolGenerateDrums,
  adjust_drum_density: toolAdjustDensity,
  generate_fill: toolGenerateFill,
  generate_bassline: toolGenerateBass,
  generate_chords: toolGenerateChords,
  set_chord_progression: toolGenerateChords,
  generate_melody: toolGenerateMelody,
  edit_notes: toolEditNotes,
  transpose: toolEditNotes,
  humanize: toolEditNotes,
  move_clip: toolMoveClip,
  resize_clip: toolResizeClip,
  duplicate_clip: toolDuplicateClip,
  create_clip_variation: toolClipVariation,
  delete_clip: toolDeleteClip,
  shape_sound: toolShapeSound,
  set_instrument: toolSetInstrument,
  set_drum_kit: toolSetKit,
  set_track_fx: toolTrackFx,
  set_track_level: toolSetLevel,
  set_track_state: toolSetState,
  set_reverb: toolSetReverb,
  automate_parameter: toolAutomate,
  set_mood: toolSetMood,
  set_energy: toolSetEnergy,
  arrange_song: toolArrangeSong,
};

export function executeToolCalls(
  calls: ProviderToolCall[],
  project: ProjectState,
  selection: AgentSelection,
): ExecutionOutput {
  const ctx: Ctx = {
    project: applyOperation(structuredClone(project), { type: "set_swing", swing: project.swing ?? 0 }),
    selection,
    ops: [],
    changes: [],
    notes: [],
    seed: (Date.now() ^ (project.revision << 8)) >>> 0,
  };
  // the priming op above just runs migrations; drop it
  ctx.ops = [];
  ctx.project.revision = project.revision;

  for (const call of calls) {
    if (!AGENT_TOOL_NAMES.has(call.name)) {
      ctx.notes.push(`Ignored unknown action "${call.name}".`);
      continue;
    }
    const fn = DISPATCH[call.name];
    if (!fn) continue;
    try {
      fn(ctx, call.input ?? {});
    } catch (error) {
      ctx.notes.push("One change couldn't be applied.");
      if (process.env.NODE_ENV !== "production") console.error("tool failed", call.name, error);
    }
  }

  if (ctx.ops.length > 600) {
    ctx.ops = ctx.ops.slice(0, 600);
    ctx.notes.push("Applied the first part of a very large change.");
  }

  return { operations: ctx.ops, changes: ctx.changes, notes: ctx.notes };
}

export { makeId };
