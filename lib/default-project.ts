import type {
  Clip,
  DrumVoice,
  MixerState,
  ProjectState,
  SynthConfig,
  SynthPreset,
  Track,
} from "@/lib/model";

export function makeId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function defaultMixer(volume = 0.75): MixerState {
  return {
    volume,
    pan: 0,
    muted: false,
    solo: false,
    delaySend: 0.08,
    reverbSend: 0.08,
  };
}

export function synthPreset(preset: SynthPreset): SynthConfig {
  switch (preset) {
    case "deep_bass":
      return {
        preset,
        oscillator: "sawtooth",
        attack: 0.005,
        decay: 0.16,
        sustain: 0.45,
        release: 0.12,
        cutoff: 720,
        resonance: 5,
        detune: 0,
      };
    case "acid":
      return {
        preset,
        oscillator: "sawtooth",
        attack: 0.002,
        decay: 0.11,
        sustain: 0.22,
        release: 0.08,
        cutoff: 1350,
        resonance: 12,
        detune: 0,
      };
    case "pad":
      return {
        preset,
        oscillator: "triangle",
        attack: 0.16,
        decay: 0.35,
        sustain: 0.75,
        release: 0.8,
        cutoff: 2400,
        resonance: 2,
        detune: -5,
      };
    case "pluck":
      return {
        preset,
        oscillator: "square",
        attack: 0.002,
        decay: 0.12,
        sustain: 0.18,
        release: 0.09,
        cutoff: 2600,
        resonance: 4,
        detune: 0,
      };
    case "lead":
      return {
        preset,
        oscillator: "square",
        attack: 0.008,
        decay: 0.12,
        sustain: 0.62,
        release: 0.15,
        cutoff: 3200,
        resonance: 3.5,
        detune: 4,
      };
  }
}

const blankSteps = (n = 16) => Array.from({ length: n }, () => false);

export function makeDrumClip(
  name = "Main drums",
  startBar = 0,
  lengthBars = 8,
): Clip {
  const drumSteps: Record<DrumVoice, boolean[]> = {
    kick: blankSteps(),
    clap: blankSteps(),
    hat: blankSteps(),
    open_hat: blankSteps(),
  };

  [0, 4, 8, 12].forEach((i) => (drumSteps.kick[i] = true));
  [4, 12].forEach((i) => (drumSteps.clap[i] = true));
  [2, 6, 10, 14].forEach((i) => (drumSteps.hat[i] = true));
  [6, 14].forEach((i) => (drumSteps.open_hat[i] = true));

  return {
    id: makeId("clip"),
    name,
    kind: "drum",
    startBar,
    lengthBars,
    looped: true,
    patternSteps: 16,
    drumSteps,
  };
}

export function makeNoteClip(
  name: string,
  startBar = 0,
  lengthBars = 8,
): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "notes",
    startBar,
    lengthBars,
    looped: true,
    patternSteps: 16,
    notes: [],
  };
}

export function makeSampleClip(
  name = "Sample pattern",
  startBar = 0,
  lengthBars = 8,
): Clip {
  return {
    id: makeId("clip"),
    name,
    kind: "sample",
    startBar,
    lengthBars,
    looped: true,
    patternSteps: 16,
    sampleTriggers: [],
  };
}

export function makeTrack(kind: "drums" | "synth" | "sampler", name?: string): Track {
  if (kind === "drums") {
    return {
      id: makeId("track"),
      name: name ?? "Drums",
      kind,
      mixer: defaultMixer(0.86),
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
      clips: [makeSampleClip()],
    };
  }

  return {
    id: makeId("track"),
    name: name ?? "Synth",
    kind,
    mixer: defaultMixer(0.68),
    synth: synthPreset("lead"),
    clips: [makeNoteClip("MIDI clip")],
  };
}

export function createDefaultProject(projectId: string): ProjectState {
  const drums: Track = {
    id: "drums",
    name: "Drums",
    kind: "drums",
    mixer: defaultMixer(0.88),
    clips: [makeDrumClip("House drums", 0, 8)],
  };

  const bassClip = makeNoteClip("Bassline", 0, 8);
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
    clips: [bassClip],
  };

  const chordClip = makeNoteClip("Chords", 0, 8);
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
    clips: [chordClip],
  };

  const leadClip = makeNoteClip("Lead idea", 4, 4);
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
    loopStartBar: 0,
    loopEndBar: 8,
    masterVolume: 0.85,
    revision: 0,
    tracks: [drums, bass, chords, lead],
    samples: [],
  };
}
