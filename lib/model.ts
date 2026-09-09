export type TrackKind = "drums" | "synth" | "sampler";
export type ClipKind = "drum" | "notes" | "sample";

export type DrumVoice =
  | "kick"
  | "snare"
  | "clap"
  | "hat"
  | "open_hat"
  | "rim"
  | "tom"
  | "perc"
  | "ride"
  | "shaker";

export const DRUM_VOICES: DrumVoice[] = [
  "kick",
  "snare",
  "clap",
  "hat",
  "open_hat",
  "rim",
  "tom",
  "perc",
  "ride",
  "shaker",
];

export type DrumKit = "house" | "acoustic" | "eight08" | "lofi" | "techno";

export type SynthPreset =
  | "deep_bass"
  | "sub_bass"
  | "reese_bass"
  | "acid"
  | "pluck"
  | "lead"
  | "saw_lead"
  | "pad"
  | "warm_pad"
  | "organ"
  | "ep"
  | "stab"
  | "bells";

export type OscillatorWave = "sine" | "square" | "sawtooth" | "triangle";

export type ScaleName =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "minor_pentatonic"
  | "major_pentatonic"
  | "harmonic_minor";

export type SectionKind =
  | "intro"
  | "groove"
  | "build"
  | "breakdown"
  | "drop"
  | "bridge"
  | "outro"
  | "custom";

export type AutomationParam =
  | "volume"
  | "cutoff"
  | "reverb"
  | "delay"
  | "drive"
  | "pan";

export type MixerState = {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  delaySend: number;
  reverbSend: number;
};

export type TrackFx = {
  filterType: "off" | "lowpass" | "highpass" | "bandpass";
  filterHz: number; // 40..18000
  resonance: number; // 0..24
  drive: number; // 0..1 saturation / distortion
  chorus: number; // 0..1
};

export type SynthConfig = {
  preset: SynthPreset;
  oscillator: OscillatorWave;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  resonance: number;
  detune: number;
  unison: number; // 1..3 detuned voices
  sub: number; // 0..1 sub-octave oscillator level
  glide: number; // 0..0.3 portamento seconds
};

export type NoteEvent = {
  id: string;
  note: number;
  startStep: number;
  durationSteps: number;
  velocity: number;
};

export type SampleTrigger = {
  step: number;
  velocity: number;
};

export type SampleAsset = {
  id: string;
  name: string;
  url: string;
};

export type Clip = {
  id: string;
  name: string;
  kind: ClipKind;
  startBar: number;
  lengthBars: number;
  looped: boolean;
  /** total pattern length in steps — `lengthBars * 16` for real multi-bar clips */
  patternSteps: number;
  swing?: number; // 0..0.6 per-clip groove (overrides project swing)
  humanize?: number; // 0..1 timing + velocity jitter
  drumSteps?: Partial<Record<DrumVoice, boolean[]>>;
  notes?: NoteEvent[];
  sampleTriggers?: SampleTrigger[];
};

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  mixer: MixerState;
  synth?: SynthConfig;
  sampleId?: string | null;
  kit?: DrumKit;
  fx?: TrackFx;
  clips: Clip[];
};

export type Section = {
  id: string;
  name: string;
  kind: SectionKind;
  startBar: number;
  lengthBars: number;
  color?: string;
};

export type Automation = {
  id: string;
  trackId: string;
  param: AutomationParam;
  startBar: number;
  endBar: number;
  from: number;
  to: number;
  curve: "linear" | "exp";
};

export type ProjectState = {
  projectId: string;
  name: string;
  bpm: number;
  bars: number;
  stepsPerBar: 16;
  playing: boolean;
  startAtMs: number | null;
  /** bar the current playback started from (for the playhead + seek) */
  startBar: number;
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  masterVolume: number;
  isPublic: boolean;
  key: string; // "A", "F#", ...
  scale: ScaleName;
  swing: number; // 0..0.6 global groove
  sections: Section[];
  automations: Automation[];
  revision: number;
  tracks: Track[];
  samples: SampleAsset[];
};

export type ProjectOperation =
  | { type: "rename_project"; name: string }
  | { type: "set_bpm"; bpm: number }
  | { type: "set_bars"; bars: number }
  | {
      type: "set_playing";
      playing: boolean;
      start_at_ms: number | null;
      from_bar?: number;
    }
  | { type: "set_loop"; start_bar: number; end_bar: number; enabled?: boolean }
  | { type: "set_master_volume"; volume: number }
  | { type: "set_public"; is_public: boolean }
  | { type: "set_key"; key: string }
  | { type: "set_scale"; scale: string }
  | { type: "set_swing"; swing: number }
  | { type: "add_section"; section: Section }
  | { type: "update_section"; section: Section }
  | { type: "delete_section"; section_id: string }
  | { type: "add_track"; track: Track }
  | { type: "delete_track"; track_id: string }
  | { type: "rename_track"; track_id: string; name: string }
  | { type: "set_track_mixer"; track_id: string; mixer: MixerState }
  | { type: "set_track_fx"; track_id: string; fx: TrackFx }
  | { type: "set_track_kit"; track_id: string; kit: DrumKit }
  | { type: "set_synth"; track_id: string; synth: SynthConfig }
  | { type: "set_sampler_asset"; track_id: string; sample_id: string | null }
  | { type: "add_clip"; track_id: string; clip: Clip }
  | { type: "delete_clip"; track_id: string; clip_id: string }
  | { type: "move_clip"; track_id: string; clip_id: string; start_bar: number }
  | { type: "resize_clip"; track_id: string; clip_id: string; length_bars: number }
  | { type: "rename_clip"; track_id: string; clip_id: string; name: string }
  | {
      type: "set_clip_groove";
      track_id: string;
      clip_id: string;
      swing?: number;
      humanize?: number;
    }
  | {
      type: "set_clip_notes";
      track_id: string;
      clip_id: string;
      notes: NoteEvent[];
    }
  | {
      type: "set_clip_drum_steps";
      track_id: string;
      clip_id: string;
      drum_steps: Partial<Record<DrumVoice, boolean[]>>;
    }
  | {
      type: "set_drum_step";
      track_id: string;
      clip_id: string;
      voice: DrumVoice;
      step: number;
      enabled: boolean;
    }
  | {
      type: "set_note_cell";
      track_id: string;
      clip_id: string;
      step: number;
      note: number;
      enabled: boolean;
      velocity: number;
      duration_steps: number;
    }
  | {
      type: "set_sample_step";
      track_id: string;
      clip_id: string;
      step: number;
      enabled: boolean;
      velocity: number;
    }
  | { type: "add_automation"; automation: Automation }
  | { type: "clear_automation"; track_id: string }
  | { type: "add_sample_asset"; asset: SampleAsset };

export const MAX_BARS = 256;
