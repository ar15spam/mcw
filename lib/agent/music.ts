/**
 * The music-generation layer.
 *
 * Deterministic, seeded, pure generators for drums / bass / chords / melody /
 * fills / percussion, plus scale + chord-progression theory and mood presets.
 * Variation comes from rhythm, velocity, note length, rests, syncopation,
 * chord tones, octave, density and swing — driven by a seeded PRNG so a given
 * request is reproducible but successive requests differ.
 *
 * Used by the AI composition tools AND by onboarding.
 */
import type {
  DrumVoice,
  NoteEvent,
  ScaleName,
  SectionKind,
  SynthConfig,
  SynthPreset,
} from "@/lib/model";

export const STEPS = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// --- seeded RNG ------------------------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
const chance = (r: Rng, p: number) => r() < p;
const pick = <T>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
const jitter = (r: Rng, v: number, amt: number) =>
  clamp(Math.round(v + (r() * 2 - 1) * amt), 1, 127);

// --- scales + keys -------------------------------------------------------

export const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
};

const NOTE_PC: Record<string, number> = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6,
  gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
};

export type Key = { rootPc: number; scale: number[]; scaleName: ScaleName; label: string };

export function parseKey(
  keyInput?: string | null,
  scaleInput?: string | null,
): Key {
  let rootPc = 9; // A
  let scaleName: ScaleName = "minor";

  if (keyInput) {
    const m = keyInput.trim().toLowerCase().match(/^([a-g][#b]?)\s*(.*)$/);
    if (m) {
      if (NOTE_PC[m[1]] !== undefined) rootPc = NOTE_PC[m[1]];
      const rest = m[2].replace(/\s+/g, "_");
      if (rest && rest in SCALES) scaleName = rest as ScaleName;
    }
  }
  if (scaleInput) {
    const s = scaleInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (s in SCALES) scaleName = s as ScaleName;
    else if (s === "min") scaleName = "minor";
    else if (s === "maj") scaleName = "major";
  }

  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return {
    rootPc,
    scale: SCALES[scaleName],
    scaleName,
    label: `${names[rootPc]} ${scaleName.replace(/_/g, " ")}`,
  };
}

/** MIDI note for a diatonic degree (0-indexed, can be negative / > len) at octave. */
export function scaleNote(key: Key, degree: number, octave: number): number {
  const len = key.scale.length;
  const oct = octave + Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return clamp(12 * oct + key.rootPc + key.scale[idx], 0, 127);
}

// --- chord progressions -------------------------------------------------

/** Progressions as scale-degree roots (0 = tonic). Chords built in thirds. */
export const PROGRESSIONS: Record<string, number[][]> = {
  minor_epic: [[0], [5], [3], [4]],
  minor_loop: [[0], [0], [3], [4]],
  andalusian: [[0], [6], [5], [4]],
  pop_axis: [[0], [4], [5], [3]],
  house_classic: [[0], [3], [4], [3]],
  deep: [[0], [2], [5], [4]],
  suspense: [[0], [1], [0], [4]],
  bright: [[0], [4], [1], [4]],
  jazzy: [[1], [4], [0], [5]],
  static_tonic: [[0], [0], [0], [0]],
};

export function chordProgression(name: string, bars: number): number[] {
  const prog = PROGRESSIONS[name] ?? PROGRESSIONS.minor_loop;
  const out: number[] = [];
  for (let b = 0; b < bars; b++) out.push(prog[b % prog.length][0]);
  return out;
}

export function chordTones(key: Key, rootDegree: number, octave: number): number[] {
  return [0, 2, 4].map((i) => scaleNote(key, rootDegree + i, octave));
}

// --- drum generation --------------------------------------------------

export type DrumStyle =
  | "four_on_floor"
  | "house"
  | "techno"
  | "garage"
  | "breakbeat"
  | "boom_bap"
  | "trap"
  | "halftime"
  | "dnb"
  | "afro"
  | "minimal";

export type Busyness = "sparse" | "medium" | "busy";
type Grid = Partial<Record<DrumVoice, boolean[]>>;

const DENSITY: Record<Busyness, number> = { sparse: 0.28, medium: 0.55, busy: 0.85 };

export type DrumOpts = {
  style: DrumStyle;
  bars: number;
  density?: number; // 0..1 overall
  syncopation?: number; // 0..1
  fills?: boolean; // add a fill on the last bar
  seed?: number;
};

function ensure(grid: Grid, v: DrumVoice, len: number) {
  if (!grid[v]) grid[v] = Array(len).fill(false);
  return grid[v]!;
}

export function drumPattern(opts: DrumOpts): Grid {
  const bars = Math.max(1, opts.bars);
  const len = bars * STEPS;
  const r = mulberry32(opts.seed ?? 1);
  const d = opts.density ?? 0.55;
  const sync = opts.syncopation ?? 0.35;
  const grid: Grid = {};

  const kick = ensure(grid, "kick", len);
  const snare = ensure(grid, "snare", len);
  const clap = ensure(grid, "clap", len);
  const hat = ensure(grid, "hat", len);
  const ohat = ensure(grid, "open_hat", len);
  const perc = ensure(grid, "perc", len);
  const shaker = ensure(grid, "shaker", len);
  const ride = ensure(grid, "ride", len);
  const tom = ensure(grid, "tom", len);

  for (let bar = 0; bar < bars; bar++) {
    const o = bar * STEPS;
    const lastBar = bar === bars - 1;
    const variation = bar % 4 === 3; // every 4th bar gets extra movement

    // ---- kick ----
    switch (opts.style) {
      case "four_on_floor":
      case "house":
      case "techno":
      case "afro":
        [0, 4, 8, 12].forEach((s) => (kick[o + s] = true));
        if (chance(r, sync * 0.5)) kick[o + 14] = true;
        if (chance(r, sync * 0.3) && opts.style !== "techno") kick[o + 7] = true;
        break;
      case "garage":
        kick[o + 0] = true;
        kick[o + 10] = true;
        if (chance(r, 0.5)) kick[o + 6] = true;
        break;
      case "boom_bap":
      case "trap":
        kick[o + 0] = true;
        kick[o + (chance(r, 0.5) ? 6 : 7)] = true;
        kick[o + 10] = true;
        if (opts.style === "trap" && chance(r, 0.4)) kick[o + 11] = true;
        break;
      case "breakbeat":
      case "dnb":
        kick[o + 0] = true;
        kick[o + 10] = true;
        if (chance(r, 0.6)) kick[o + 6] = true;
        break;
      case "halftime":
        kick[o + 0] = true;
        if (chance(r, 0.3)) kick[o + 3] = true;
        break;
      case "minimal":
        kick[o + 0] = true;
        if (bar % 2 === 1) kick[o + 8] = true;
        break;
    }

    // ---- backbeat (snare / clap) ----
    const back = opts.style === "boom_bap" || opts.style === "trap" ? "snare" : "clap";
    const backRow = back === "snare" ? snare : clap;
    if (opts.style === "halftime" || opts.style === "dnb") {
      backRow[o + 8] = true;
    } else if (opts.style === "breakbeat") {
      backRow[o + 4] = true;
      backRow[o + 12] = true;
      if (chance(r, 0.4)) snare[o + 10] = true; // ghost
    } else {
      backRow[o + 4] = true;
      backRow[o + 12] = true;
    }
    if (chance(r, d * 0.25)) snare[o + pick(r, [7, 11, 15])] = true; // ghost snare

    // ---- hats ----
    const hatEvery = opts.style === "trap" || opts.style === "dnb" ? 1 : d > 0.7 ? 1 : 2;
    for (let s = 0; s < STEPS; s += hatEvery) {
      if (chance(r, 0.85)) hat[o + s] = true;
    }
    if (opts.style === "trap") {
      // hat rolls
      const rollAt = pick(r, [6, 10, 14]);
      hat[o + rollAt] = true;
      if (chance(r, 0.7)) hat[o + rollAt + 1] = true;
    }
    // open hats on the off-beat
    if (opts.style === "house" || opts.style === "techno" || opts.style === "afro") {
      [2, 6, 10, 14].forEach((s) => chance(r, 0.6 + d * 0.3) && (ohat[o + s] = true));
    } else if (chance(r, 0.3)) {
      ohat[o + pick(r, [7, 14, 15])] = true;
    }

    // ---- percussion / shaker / ride (energy layers) ----
    if (d > 0.45 || opts.style === "afro") {
      for (let s = 1; s < STEPS; s += 2) if (chance(r, d * 0.5)) shaker[o + s] = true;
    }
    if (d > 0.6 && chance(r, 0.6)) {
      perc[o + pick(r, [3, 7, 11, 13, 15])] = true;
    }
    if (opts.style === "afro") {
      [3, 6, 11, 14].forEach((s) => chance(r, 0.5) && (perc[o + s] = true));
    }
    if ((opts.style === "boom_bap" || opts.style === "trap") && d > 0.4) {
      for (let s = 0; s < STEPS; s += 4) if (chance(r, 0.4)) ride[o + s] = true;
    }

    // ---- per-bar variation + fills ----
    if (variation && chance(r, 0.6)) {
      kick[o + pick(r, [2, 3, 11, 14])] = true;
    }
    if (lastBar && opts.fills) {
      // clear the tail and drop a fill
      for (let s = 12; s < STEPS; s++) {
        hat[o + s] = false;
        ohat[o + s] = false;
      }
      const fillNotes = pick(r, [
        [12, 13, 14, 15],
        [12, 14, 15],
        [13, 14, 15],
      ]);
      fillNotes.forEach((s, i) => {
        tom[o + s] = true;
        snare[o + s] = i % 2 === 1;
      });
      kick[o + 15] = false;
    }
  }

  return grid;
}

export function generateFill(bars: number, intensity = 0.7, seed = 2): Grid {
  const len = bars * STEPS;
  const r = mulberry32(seed);
  const grid: Grid = {};
  const snare = ensure(grid, "snare", len);
  const tom = ensure(grid, "tom", len);
  const kick = ensure(grid, "kick", len);
  const start = Math.max(0, len - Math.round(STEPS * (0.5 + intensity)));
  for (let s = start; s < len; s++) {
    if (chance(r, 0.3 + intensity * 0.5)) (r() > 0.5 ? snare : tom)[s] = true;
    if (chance(r, intensity * 0.3)) kick[s] = true;
  }
  snare[len - 1] = true;
  return grid;
}

// --- bass generation ------------------------------------------------

export type BassFeel = "sub" | "driving" | "offbeat" | "walking" | "rolling" | "arp" | "dub";

export type BassOpts = {
  key: Key;
  progression: number[]; // per-bar root degree
  feel: BassFeel;
  octave?: number;
  density?: number;
  seed?: number;
};

export function bassLine(opts: BassOpts): NoteEvent[] {
  const { key, progression } = opts;
  const octave = opts.octave ?? 2;
  const d = opts.density ?? 0.55;
  const r = mulberry32(opts.seed ?? 3);
  const notes: NoteEvent[] = [];
  const bars = progression.length;

  for (let bar = 0; bar < bars; bar++) {
    const o = bar * STEPS;
    const deg = progression[bar];
    const root = scaleNote(key, deg, octave);
    const fifth = scaleNote(key, deg + 4, octave);
    const third = scaleNote(key, deg + 2, octave);
    const oct = scaleNote(key, deg + 7, octave);
    const add = (step: number, note: number, dur: number, vel = 108) =>
      notes.push({
        id: `b-${bar}-${step}`,
        note,
        startStep: o + step,
        durationSteps: dur,
        velocity: jitter(r, vel, 10),
      });

    switch (opts.feel) {
      case "sub":
        add(0, root, STEPS, 112);
        break;
      case "dub":
        add(0, root, 6, 114);
        if (chance(r, 0.6)) add(10, root, 4, 100);
        break;
      case "driving": {
        const pat = pick(r, [
          [0, 3, 6, 8, 10, 14],
          [0, 2, 4, 8, 10, 12],
          [0, 3, 8, 11, 14],
        ]);
        pat.forEach((s, i) => add(s, i % 3 === 2 && chance(r, 0.4) ? fifth : root, 1, 100 + (s % 4 === 0 ? 12 : 0)));
        break;
      }
      case "offbeat":
        [2, 6, 10, 14].forEach((s, i) => {
          if (chance(r, 0.85 - (1 - d) * 0.3))
            add(s, i === 2 ? fifth : i === 3 ? third : root, 2, 102);
        });
        break;
      case "walking":
        [0, 4, 8, 12].forEach((s, i) =>
          add(s, [root, third, fifth, oct][i], 4, 96),
        );
        if (chance(r, d)) add(14, scaleNote(key, deg + 5, octave), 2, 84);
        break;
      case "rolling":
        for (let s = 0; s < STEPS; s += 2) {
          if (chance(r, 0.75 + d * 0.2))
            add(s, s % 8 === 4 ? fifth : root, 1, 92 + (s % 4 === 0 ? 14 : 0));
        }
        break;
      case "arp":
        [0, 4, 8, 12].forEach((s, i) =>
          add(s, [root, third, fifth, oct][i], 3, 96),
        );
        [2, 6, 10, 14].forEach((s) => chance(r, d) && add(s, root, 1, 74));
        break;
    }
  }
  return notes;
}

// --- chord generation ----------------------------------------------

export type ChordOpts = {
  key: Key;
  progression: number[];
  octave?: number;
  style: "pad" | "stab" | "arp" | "piano";
  density?: number;
  seed?: number;
};

export function chordPart(opts: ChordOpts): NoteEvent[] {
  const { key, progression } = opts;
  const octave = opts.octave ?? 4;
  const r = mulberry32(opts.seed ?? 4);
  const d = opts.density ?? 0.5;
  const notes: NoteEvent[] = [];

  progression.forEach((deg, bar) => {
    const o = bar * STEPS;
    const inv = Math.floor(r() * 3);
    const tones = chordTones(key, deg, octave).map((n, i) =>
      i < inv ? n + 12 : n,
    );
    const seventh = chance(r, 0.35) ? [scaleNote(key, deg + 6, octave)] : [];
    const voicing = [...tones, ...seventh].sort((a, b) => a - b);

    const push = (step: number, dur: number, vel: number) =>
      voicing.forEach((note, i) =>
        notes.push({
          id: `c-${bar}-${step}-${i}`,
          note,
          startStep: o + step,
          durationSteps: dur,
          velocity: jitter(r, vel, 8),
        }),
      );

    if (opts.style === "pad") {
      push(0, STEPS, 66);
    } else if (opts.style === "piano") {
      push(0, 8, 74);
      if (chance(r, d)) push(8, 6, 64);
    } else if (opts.style === "stab") {
      const hits = pick(r, [
        [2, 6, 10, 14],
        [0, 6, 8, 14],
        [2, 4, 10, 12],
      ]);
      hits.forEach((s) => chance(r, 0.6 + d * 0.3) && push(s, 2, 82));
    } else {
      // arp
      voicing.forEach((note, i) => {
        const s = (i * 3) % STEPS;
        notes.push({
          id: `c-${bar}-arp-${i}`,
          note,
          startStep: o + s,
          durationSteps: 2,
          velocity: 70,
        });
      });
    }
  });
  return notes;
}

// --- melody generation -------------------------------------------

export type MelodyMood = "bright" | "dark" | "dreamy" | "tense" | "playful" | "simple" | "hook";

export type MelodyOpts = {
  key: Key;
  progression: number[];
  mood: MelodyMood;
  density?: Busyness;
  octave?: number;
  seed?: number;
};

export function melodyLine(opts: MelodyOpts): NoteEvent[] {
  const { key, progression, mood } = opts;
  const octave = opts.octave ?? 5;
  const r = mulberry32(opts.seed ?? 5);
  const bars = progression.length;
  const notes: NoteEvent[] = [];

  const contour: Record<MelodyMood, number[]> = {
    bright: [0, 2, 4, 2, 4, 6, 4, 7],
    dark: [0, -1, -3, -1, 0, -2, -4, -2],
    dreamy: [4, 6, 4, 2, 4, 7, 6, 4],
    tense: [0, 1, 0, 2, 1, 3, 2, 4],
    playful: [0, 4, 2, 5, 4, 7, 4, 2],
    simple: [0, 2, 0, 4, 2, 0, 4, 2],
    hook: [4, 4, 2, 0, 4, 4, 5, 7],
  };
  const shape = contour[mood];
  const restProb = mood === "dreamy" ? 0.35 : mood === "simple" ? 0.4 : 0.2;
  const gap =
    opts.density === "busy" ? 2 : opts.density === "sparse" ? 6 : 4;
  const dur = opts.density === "busy" ? 2 : opts.density === "sparse" ? 6 : 3;
  const useChordTone = 0.55;

  let motif = shape.slice(0, 4);
  for (let bar = 0; bar < bars; bar++) {
    const o = bar * STEPS;
    const deg = progression[bar];
    // develop the motif every 2 bars
    if (bar > 0 && bar % 2 === 0) {
      motif = motif.map((n) => n + pick(r, [-2, -1, 0, 1, 2]));
    }
    let mi = 0;
    for (let s = 0; s < STEPS; s += gap) {
      if (chance(r, restProb)) {
        mi++;
        continue;
      }
      const base = motif[mi % motif.length] ?? shape[mi % shape.length];
      const degree = chance(r, useChordTone)
        ? deg + [0, 2, 4][Math.abs(base) % 3]
        : deg + base;
      const note = scaleNote(key, degree, octave);
      notes.push({
        id: `m-${bar}-${s}`,
        note,
        startStep: o + s,
        durationSteps: chance(r, 0.15) ? dur * 2 : dur,
        velocity: jitter(r, 88, 14),
      });
      mi++;
    }
  }
  return notes;
}

export function percLayer(
  style: "shaker" | "conga" | "ride" | "clave",
  bars: number,
  seed = 6,
): Grid {
  const len = bars * STEPS;
  const r = mulberry32(seed);
  const grid: Grid = {};
  const voice: DrumVoice =
    style === "ride" ? "ride" : style === "conga" ? "tom" : "perc";
  const row = ensure(grid, voice, len);
  for (let s = 0; s < len; s++) {
    if (style === "clave") {
      if ([3, 6, 10, 12, 16, 22, 26, 28].includes(s % STEPS)) row[s] = chance(r, 0.9);
    } else if (style === "ride") {
      if (s % 4 === 0) row[s] = chance(r, 0.85);
    } else {
      if (s % 2 === 1) row[s] = chance(r, 0.55);
    }
  }
  return grid;
}

// --- transforms --------------------------------------------------

export function transposeNotes(notes: NoteEvent[], semitones: number): NoteEvent[] {
  return notes.map((n) => ({ ...n, note: clamp(n.note + semitones, 0, 127) }));
}

export function humanize(notes: NoteEvent[], amount: number, maxStep: number): NoteEvent[] {
  if (amount <= 0) return notes;
  const r = mulberry32(Math.floor(Math.random() * 1e9));
  return notes.map((n) => ({
    ...n,
    startStep: clamp(n.startStep + Math.round((r() * 2 - 1) * amount * 1.6), 0, maxStep - 1),
    velocity: jitter(r, n.velocity, amount * 26),
  }));
}

export function quantize(notes: NoteEvent[], grid: number): NoteEvent[] {
  const g = Math.max(1, grid);
  return notes.map((n) => ({ ...n, startStep: Math.round(n.startStep / g) * g }));
}

// --- sound design (macros) -------------------------------------

export type SoundMacro = "brightness" | "warmth" | "space" | "movement" | "energy";

export function readMacros(synth: SynthConfig): Record<SoundMacro, number> {
  const bright = clamp(
    (Math.log(synth.cutoff) - Math.log(120)) / (Math.log(13000) - Math.log(120)),
    0,
    1,
  );
  return {
    brightness: bright,
    warmth: clamp(1 - bright * 0.6 + (["sine", "triangle"].includes(synth.oscillator) ? 0.25 : 0), 0, 1),
    space: clamp(synth.release / 6, 0, 1),
    movement: clamp((Math.abs(synth.detune) + (synth.unison - 1) * 20) / 80, 0, 1),
    energy: clamp(1 - synth.attack / 0.5, 0, 1),
  };
}

export function shapeSound(synth: SynthConfig, macro: SoundMacro, amount: number): SynthConfig {
  const next = { ...synth };
  const a = clamp(amount, -1, 1);
  const lerpLog = (cur: number, target: number, t: number) =>
    clamp(Math.exp(Math.log(cur) + (Math.log(target) - Math.log(cur)) * t), 40, 17000);

  switch (macro) {
    case "brightness":
      next.cutoff = lerpLog(next.cutoff, a >= 0 ? 15000 : 200, Math.abs(a) * 0.7);
      if (a > 0.5) next.resonance = clamp(next.resonance + 2, 0.01, 24);
      break;
    case "warmth":
      next.cutoff = lerpLog(next.cutoff, a >= 0 ? 900 : 6000, Math.abs(a) * 0.55);
      if (a > 0.3 && !["sine", "triangle"].includes(next.oscillator))
        next.oscillator = "triangle";
      break;
    case "space":
      next.release = clamp(next.release + (a >= 0 ? 2.5 : -2.5) * Math.abs(a), 0.02, 6);
      next.attack = clamp(next.attack + (a >= 0 ? 0.2 : -0.2) * Math.abs(a), 0.001, 1.5);
      break;
    case "movement":
      next.detune = clamp(next.detune + (a >= 0 ? 20 : -20) * Math.abs(a), -80, 80);
      next.unison = clamp(Math.round(next.unison + (a >= 0 ? 1 : -1)), 1, 3);
      break;
    case "energy":
      next.attack = clamp(next.attack + (a >= 0 ? -0.25 : 0.3) * Math.abs(a), 0.001, 1.5);
      next.sustain = clamp(next.sustain + (a >= 0 ? 0.15 : -0.15) * Math.abs(a), 0.05, 1);
      break;
  }
  return next;
}

// --- moods + arrangement spec --------------------------------

export type MoodSpec = {
  label: string;
  bpm: number;
  key: string;
  scale: ScaleName;
  swing: number;
  drumStyle: DrumStyle;
  drumKit: string;
  bassFeel: BassFeel;
  bassPreset: SynthPreset;
  chordStyle: ChordOpts["style"];
  chordPreset: SynthPreset;
  leadPreset: SynthPreset;
  leadMood: MelodyMood;
  progression: string;
  brightness: number; // -1..1 bias
};

export const MOODS: Record<string, MoodSpec> = {
  dark: { label: "Dark", bpm: 122, key: "F", scale: "minor", swing: 0.05, drumStyle: "techno", drumKit: "techno", bassFeel: "sub", bassPreset: "sub_bass", chordStyle: "pad", chordPreset: "warm_pad", leadPreset: "stab", leadMood: "dark", progression: "minor_loop", brightness: -0.6 },
  dreamy: { label: "Dreamy", bpm: 100, key: "D", scale: "lydian", swing: 0, drumStyle: "halftime", drumKit: "lofi", bassFeel: "sub", bassPreset: "sub_bass", chordStyle: "pad", chordPreset: "warm_pad", leadPreset: "bells", leadMood: "dreamy", progression: "bright", brightness: 0.1 },
  electric: { label: "Electric", bpm: 126, key: "A", scale: "minor", swing: 0, drumStyle: "house", drumKit: "house", bassFeel: "driving", bassPreset: "reese_bass", chordStyle: "stab", chordPreset: "stab", leadPreset: "saw_lead", leadMood: "hook", progression: "house_classic", brightness: 0.7 },
  warm: { label: "Warm", bpm: 96, key: "G", scale: "major", swing: 0.12, drumStyle: "boom_bap", drumKit: "acoustic", bassFeel: "walking", bassPreset: "deep_bass", chordStyle: "piano", chordPreset: "ep", leadPreset: "organ", leadMood: "simple", progression: "jazzy", brightness: -0.2 },
  bouncy: { label: "Bouncy", bpm: 128, key: "C", scale: "minor", swing: 0.3, drumStyle: "garage", drumKit: "house", bassFeel: "offbeat", bassPreset: "reese_bass", chordStyle: "stab", chordPreset: "stab", leadPreset: "pluck", leadMood: "playful", progression: "deep", brightness: 0.4 },
  chill: { label: "Chill", bpm: 84, key: "E", scale: "dorian", swing: 0.16, drumStyle: "boom_bap", drumKit: "lofi", bassFeel: "walking", bassPreset: "deep_bass", chordStyle: "piano", chordPreset: "ep", leadPreset: "ep", leadMood: "simple", progression: "jazzy", brightness: -0.1 },
  aggressive: { label: "Aggressive", bpm: 142, key: "E", scale: "phrygian", swing: 0, drumStyle: "techno", drumKit: "techno", bassFeel: "rolling", bassPreset: "reese_bass", chordStyle: "stab", chordPreset: "acid", leadPreset: "saw_lead", leadMood: "tense", progression: "suspense", brightness: 0.6 },
  late_night: { label: "Late Night", bpm: 118, key: "A", scale: "minor", swing: 0.08, drumStyle: "minimal", drumKit: "techno", bassFeel: "offbeat", bassPreset: "sub_bass", chordStyle: "pad", chordPreset: "warm_pad", leadPreset: "stab", leadMood: "dark", progression: "static_tonic", brightness: -0.35 },
  house: { label: "House", bpm: 124, key: "A", scale: "minor", swing: 0.04, drumStyle: "house", drumKit: "house", bassFeel: "driving", bassPreset: "deep_bass", chordStyle: "stab", chordPreset: "stab", leadPreset: "pluck", leadMood: "hook", progression: "house_classic", brightness: 0.3 },
  techno: { label: "Techno", bpm: 132, key: "C", scale: "minor", swing: 0, drumStyle: "techno", drumKit: "techno", bassFeel: "rolling", bassPreset: "reese_bass", chordStyle: "stab", chordPreset: "acid", leadPreset: "acid", leadMood: "tense", progression: "static_tonic", brightness: 0.5 },
  hip_hop: { label: "Hip-Hop", bpm: 90, key: "C", scale: "minor", swing: 0.18, drumStyle: "boom_bap", drumKit: "acoustic", bassFeel: "walking", bassPreset: "deep_bass", chordStyle: "piano", chordPreset: "ep", leadPreset: "bells", leadMood: "simple", progression: "andalusian", brightness: -0.15 },
  trap: { label: "Trap", bpm: 140, key: "F", scale: "minor", swing: 0, drumStyle: "trap", drumKit: "eight08", bassFeel: "sub", bassPreset: "sub_bass", chordStyle: "arp", chordPreset: "bells", leadPreset: "bells", leadMood: "dark", progression: "minor_loop", brightness: -0.1 },
  dnb: { label: "Drum & Bass", bpm: 174, key: "D", scale: "minor", swing: 0, drumStyle: "dnb", drumKit: "techno", bassFeel: "dub", bassPreset: "reese_bass", chordStyle: "pad", chordPreset: "warm_pad", leadPreset: "saw_lead", leadMood: "tense", progression: "minor_epic", brightness: 0.3 },
  afrobeat: { label: "Afrobeat", bpm: 112, key: "A", scale: "mixolydian", swing: 0.14, drumStyle: "afro", drumKit: "acoustic", bassFeel: "offbeat", bassPreset: "deep_bass", chordStyle: "stab", chordPreset: "organ", leadPreset: "organ", leadMood: "playful", progression: "pop_axis", brightness: 0.2 },
};

export function resolveMood(name?: string | null): MoodSpec {
  if (!name) return MOODS.house;
  const k = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return MOODS[k] ?? MOODS.house;
}

// --- section / energy-curve templates --------------------------

export type SectionPlan = { kind: SectionKind; bars: number; energy: number };

export function sectionTemplate(totalBars: number): SectionPlan[] {
  const t = clamp(totalBars, 8, 256);
  if (t <= 16) {
    return [
      { kind: "intro", bars: 4, energy: 0.35 },
      { kind: "groove", bars: t - 8, energy: 0.7 },
      { kind: "outro", bars: 4, energy: 0.4 },
    ];
  }
  if (t <= 32) {
    return [
      { kind: "intro", bars: 8, energy: 0.3 },
      { kind: "groove", bars: 8, energy: 0.65 },
      { kind: "build", bars: 4, energy: 0.8 },
      { kind: "drop", bars: 8, energy: 1 },
      { kind: "outro", bars: 4, energy: 0.35 },
    ];
  }
  // long-form 40-64+
  const drop = Math.max(8, Math.round(t * 0.28));
  const long: SectionPlan[] = [
    { kind: "intro", bars: 8, energy: 0.28 },
    { kind: "groove", bars: 8, energy: 0.6 },
    { kind: "build", bars: 8, energy: 0.82 },
    { kind: "drop", bars: drop, energy: 1 },
    { kind: "breakdown", bars: 8, energy: 0.45 },
    { kind: "build", bars: 4, energy: 0.85 },
    { kind: "drop", bars: Math.max(8, t - 8 - 8 - 8 - drop - 8 - 4 - 8), energy: 1 },
    { kind: "outro", bars: 8, energy: 0.3 },
  ];
  return long.filter((s) => s.bars > 0);
}
