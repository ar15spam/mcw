export type TrackKind = "drums" | "synth" | "sampler";
export type ClipKind = "drum" | "notes" | "sample";
export type DrumVoice = "kick" | "clap" | "hat" | "open_hat";
export type SynthPreset = "deep_bass" | "acid" | "pad" | "pluck" | "lead";
export type OscillatorWave = "sine" | "square" | "sawtooth" | "triangle";

export type MixerState = {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  delaySend: number;
  reverbSend: number;
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
  patternSteps: number;
  drumSteps?: Record<DrumVoice, boolean[]>;
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
  clips: Clip[];
};

export type ProjectState = {
  projectId: string;
  name: string;
  bpm: number;
  bars: number;
  stepsPerBar: 16;
  playing: boolean;
  startAtMs: number | null;
  loopStartBar: number;
  loopEndBar: number;
  masterVolume: number;
  isPublic: boolean;
  revision: number;
  tracks: Track[];
  samples: SampleAsset[];
};

export type ProjectOperation =
  | { type: "rename_project"; name: string }
  | { type: "set_bpm"; bpm: number }
  | { type: "set_bars"; bars: number }
  | { type: "set_playing"; playing: boolean; start_at_ms: number | null }
  | { type: "set_loop"; start_bar: number; end_bar: number }
  | { type: "set_master_volume"; volume: number }
  | { type: "set_public"; is_public: boolean }
  | { type: "add_track"; track: Track }
  | { type: "delete_track"; track_id: string }
  | { type: "rename_track"; track_id: string; name: string }
  | { type: "set_track_mixer"; track_id: string; mixer: MixerState }
  | { type: "set_synth"; track_id: string; synth: SynthConfig }
  | { type: "set_sampler_asset"; track_id: string; sample_id: string | null }
  | { type: "add_clip"; track_id: string; clip: Clip }
  | { type: "delete_clip"; track_id: string; clip_id: string }
  | { type: "move_clip"; track_id: string; clip_id: string; start_bar: number }
  | { type: "resize_clip"; track_id: string; clip_id: string; length_bars: number }
  | { type: "rename_clip"; track_id: string; clip_id: string; name: string }
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
  | { type: "add_sample_asset"; asset: SampleAsset };
