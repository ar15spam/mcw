import type {
  Clip,
  DrumKit,
  DrumVoice,
  MixerState,
  ProjectState,
  SynthConfig,
  SynthPreset,
  Track,
  TrackFx,
} from "@/lib/model";

export function makeId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function defaultMixer(volume = 0.75): MixerState {
  return { volume, pan: 0, muted: false, solo: false, delaySend: 0.06, reverbSend: 0.08 };
}

export function defaultFx(): TrackFx {
  return { filterType: "off", filterHz: 12000, resonance: 0.7, drive: 0, chorus: 0 };
}

type PresetDef = Omit<SynthConfig, "preset">;

const PRESETS: Record<SynthPreset, PresetDef> = {
  deep_bass: { oscillator: "sawtooth", attack: 0.005, decay: 0.18, sustain: 0.5, release: 0.14, cutoff: 700, resonance: 5, detune: 0, unison: 1, sub: 0.5, glide: 0 },
  sub_bass: { oscillator: "sine", attack: 0.006, decay: 0.2, sustain: 0.7, release: 0.16, cutoff: 400, resonance: 1, detune: 0, unison: 1, sub: 0.7, glide: 0.02 },
  reese_bass: { oscillator: "sawtooth", attack: 0.01, decay: 0.25, sustain: 0.75, release: 0.2, cutoff: 900, resonance: 6, detune: 22, unison: 3, sub: 0.3, glide: 0 },
  acid: { oscillator: "sawtooth", attack: 0.002, decay: 0.1, sustain: 0.2, release: 0.08, cutoff: 1300, resonance: 16, detune: 0, unison: 1, sub: 0.15, glide: 0.04 },
  pluck: { oscillator: "square", attack: 0.002, decay: 0.13, sustain: 0.12, release: 0.1, cutoff: 2800, resonance: 4, detune: 0, unison: 1, sub: 0, glide: 0 },
  lead: { oscillator: "square", attack: 0.008, decay: 0.12, sustain: 0.62, release: 0.16, cutoff: 3400, resonance: 3.5, detune: 5, unison: 2, sub: 0, glide: 0 },
  saw_lead: { oscillator: "sawtooth", attack: 0.01, decay: 0.14, sustain: 0.7, release: 0.2, cutoff: 3800, resonance: 3, detune: 14, unison: 3, sub: 0, glide: 0.03 },
  pad: { oscillator: "triangle", attack: 0.35, decay: 0.4, sustain: 0.85, release: 1.4, cutoff: 2200, resonance: 2, detune: -6, unison: 2, sub: 0, glide: 0 },
  warm_pad: { oscillator: "sine", attack: 0.5, decay: 0.6, sustain: 0.9, release: 2.2, cutoff: 1600, resonance: 1, detune: 8, unison: 3, sub: 0.1, glide: 0 },
  organ: { oscillator: "square", attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.12, cutoff: 3000, resonance: 1, detune: 0, unison: 2, sub: 0.4, glide: 0 },
  ep: { oscillator: "triangle", attack: 0.004, decay: 0.9, sustain: 0.2, release: 0.6, cutoff: 3200, resonance: 1, detune: 3, unison: 1, sub: 0.1, glide: 0 },
  stab: { oscillator: "sawtooth", attack: 0.003, decay: 0.22, sustain: 0.05, release: 0.14, cutoff: 2400, resonance: 5, detune: 10, unison: 2, sub: 0, glide: 0 },
  bells: { oscillator: "sine", attack: 0.002, decay: 1.4, sustain: 0.0, release: 1.2, cutoff: 6000, resonance: 1, detune: 0, unison: 1, sub: 0, glide: 0 },
};

export function synthPreset(preset: SynthPreset): SynthConfig {
  const def = PRESETS[preset] ?? PRESETS.lead;
  return { preset, ...def };
}

export const SYNTH_PRESETS = Object.keys(PRESETS) as SynthPreset[];

// ---------------------------------------------------------------------------
// clips
// ---------------------------------------------------------------------------

const STEPS_PER_BAR = 16;
const blank = (n: number) => Array.from({ length: n }, () => false);

export function makeDrumClip(name = "Beat", startBar = 0, lengthBars = 2): Clip {
  const len = lengthBars * STEPS_PER_BAR;
  const drumSteps: Partial<Record<DrumVoice, boolean[]>> = {
    kick: blank(len),
    snare: blank(len),
    clap: blank(len),
    hat: blank(len),
    open_hat: blank(len),
  };
  // a plain four-on-the-floor starting point (per bar)
  for (let bar = 0; bar < lengthBars; bar++) {
    const o = bar * STEPS_PER_BAR;
    [0, 4, 8, 12].forEach((i) => (drumSteps.kick![o + i] = true));
    [4, 12].forEach((i) => (drumSteps.clap![o + i] = true));
    [2, 6, 10, 14].forEach((i) => (drumSteps.hat![o + i] = true));
  }

  return {
    id: makeId("clip"),
    name,
    kind: "drum",
    startBar,
    lengthBars,
    looped: false,
    patternSteps: len,
    drumSteps,
  };
}

export function makeNoteClip(name: string, startBar = 0, lengthBars = 2): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "notes",
    startBar,
    lengthBars,
    looped: false,
    patternSteps: lengthBars * STEPS_PER_BAR,
    notes: [],
  };
}

export function makeSampleClip(name = "Sample", startBar = 0, lengthBars = 2): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "sample",
    startBar,
    lengthBars,
    looped: false,
    patternSteps: lengthBars * STEPS_PER_BAR,
    sampleTriggers: [],
  };
}

export function makeTrack(
  kind: "drums" | "synth" | "sampler",
  name?: string,
): Track {
  if (kind === "drums") {
    return {
      id: makeId("track"),
      name: name ?? "Drums",
      kind,
      mixer: defaultMixer(0.86),
      kit: "house" as DrumKit,
      fx: defaultFx(),
      clips: [makeDrumClip()],
    };
  }
  if (kind === "sampler") {
    return {
      id: makeId("track"),
      name: name ?? "Sampler",
      kind,
      mixer: defaultMixer(0.7),
      sampleId: null,
      fx: defaultFx(),
      clips: [makeSampleClip()],
    };
  }
  return {
    id: makeId("track"),
    name: name ?? "Synth",
    kind,
    mixer: defaultMixer(0.66),
    synth: synthPreset("lead"),
    fx: defaultFx(),
    clips: [makeNoteClip("Part")],
  };
}

// ---------------------------------------------------------------------------
// the optional house starter — one starting point, NOT the template for
// AI generation.
// ---------------------------------------------------------------------------

export function createDefaultProject(projectId: string): ProjectState {
  const drumSteps: Partial<Record<DrumVoice, boolean[]>> = {
    kick: blank(16),
    clap: blank(16),
    hat: blank(16),
    open_hat: blank(16),
  };
  [0, 4, 8, 12].forEach((i) => (drumSteps.kick![i] = true));
  [4, 12].forEach((i) => (drumSteps.clap![i] = true));
  [2, 6, 10, 14].forEach((i) => (drumSteps.hat![i] = true));
  [6, 14].forEach((i) => (drumSteps.open_hat![i] = true));

  const drums: Track = {
    id: "drums",
    name: "Drums",
    kind: "drums",
    mixer: defaultMixer(0.88),
    kit: "house",
    fx: defaultFx(),
    clips: [
      {
        id: "clip-drums",
        name: "House drums",
        kind: "drum",
        startBar: 0,
        lengthBars: 8,
        looped: true,
        patternSteps: 16,
        drumSteps,
      },
    ],
  };

  const bassClip = makeNoteClip("Bassline", 0, 8);
  bassClip.looped = true;
  bassClip.patternSteps = 16;
  bassClip.notes = [0, 3, 6, 10, 12].map((step, i) => ({
    id: `bass-note-${i}`,
    note: step === 10 ? 39 : 36,
    startStep: step,
    durationSteps: 1,
    velocity: 105,
  }));

  const bass: Track = {
    id: "bass",
    name: "Deep Bass",
    kind: "synth",
    mixer: { ...defaultMixer(0.72), delaySend: 0.03, reverbSend: 0.02 },
    synth: synthPreset("deep_bass"),
    fx: defaultFx(),
    clips: [bassClip],
  };

  const chordClip = makeNoteClip("Chords", 0, 8);
  chordClip.looped = true;
  chordClip.patternSteps = 16;
  chordClip.notes = [
    ...[60, 63, 67].map((note, i) => ({
      id: `chord-a-${i}`,
      note,
      startStep: 0,
      durationSteps: 4,
      velocity: 78,
    })),
    ...[58, 62, 65].map((note, i) => ({
      id: `chord-b-${i}`,
      note,
      startStep: 8,
      durationSteps: 4,
      velocity: 76,
    })),
  ];

  const chords: Track = {
    id: "chords",
    name: "Chords",
    kind: "synth",
    mixer: { ...defaultMixer(0.5), reverbSend: 0.26, delaySend: 0.08 },
    synth: synthPreset("pad"),
    fx: defaultFx(),
    clips: [chordClip],
  };

  const leadClip = makeNoteClip("Lead idea", 4, 4);
  leadClip.looped = true;
  leadClip.patternSteps = 16;
  leadClip.notes = [0, 2, 4, 7, 10, 12, 14].map((step, i) => ({
    id: `lead-${i}`,
    note: [72, 75, 79, 77, 75, 72, 70][i],
    startStep: step,
    durationSteps: 1,
    velocity: 88,
  }));

  const lead: Track = {
    id: "lead",
    name: "Lead",
    kind: "synth",
    mixer: { ...defaultMixer(0.42), delaySend: 0.22, reverbSend: 0.18 },
    synth: synthPreset("pluck"),
    fx: defaultFx(),
    clips: [leadClip],
  };

  return {
    projectId,
    name: "House Jam",
    bpm: 124,
    bars: 8,
    stepsPerBar: 16,
    playing: false,
    startAtMs: null,
    startBar: 0,
    loopEnabled: true,
    loopStartBar: 0,
    loopEndBar: 8,
    masterVolume: 0.85,
    isPublic: false,
    key: "A",
    scale: "minor",
    swing: 0,
    sections: [],
    automations: [],
    revision: 0,
    tracks: [drums, bass, chords, lead],
    samples: [],
  };
}
