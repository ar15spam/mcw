import type {
  Automation,
  DrumVoice,
  NoteEvent,
  ProjectOperation,
  ProjectState,
  ScaleName,
} from "@/lib/model";
import { MAX_BARS } from "@/lib/model";
import { makeId } from "@/lib/default-project";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const SCALE_NAMES: ScaleName[] = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "minor_pentatonic",
  "major_pentatonic",
  "harmonic_minor",
];

export function applyOperation(
  current: ProjectState,
  operation: ProjectOperation,
): ProjectState {
  const next = structuredClone(current);
  next.revision += 1;

  // migrate older documents in place
  next.key ??= "A";
  next.scale ??= "minor";
  next.swing ??= 0;
  next.sections ??= [];
  next.automations ??= [];
  next.startBar ??= 0;
  next.loopEnabled ??= true;

  switch (operation.type) {
    case "rename_project":
      next.name = operation.name.slice(0, 80);
      break;

    case "set_bpm":
      next.bpm = clamp(Math.round(operation.bpm), 40, 240);
      break;

    case "set_bars": {
      next.bars = clamp(Math.round(operation.bars), 1, MAX_BARS);
      next.loopEndBar = Math.min(next.loopEndBar, next.bars);
      if (next.loopEndBar <= next.loopStartBar) {
        next.loopStartBar = 0;
        next.loopEndBar = next.bars;
      }
      break;
    }

    case "set_playing":
      next.playing = operation.playing;
      next.startAtMs = operation.playing ? operation.start_at_ms : null;
      if (typeof operation.from_bar === "number") {
        next.startBar = clamp(Math.round(operation.from_bar), 0, Math.max(0, next.bars - 1));
      } else if (!operation.playing) {
        next.startBar = 0;
      }
      break;

    case "set_loop":
      next.loopStartBar = clamp(Math.round(operation.start_bar), 0, next.bars - 1);
      next.loopEndBar = clamp(
        Math.round(operation.end_bar),
        next.loopStartBar + 1,
        next.bars,
      );
      if (typeof operation.enabled === "boolean") next.loopEnabled = operation.enabled;
      break;

    case "set_master_volume":
      next.masterVolume = clamp(operation.volume, 0, 1);
      break;

    case "set_public":
      next.isPublic = operation.is_public;
      break;

    case "set_key":
      if (/^[A-Ga-g][#b]?$/.test(operation.key.trim())) {
        next.key = operation.key.trim().toUpperCase().replace("B", "b");
      }
      break;

    case "set_scale":
      if ((SCALE_NAMES as string[]).includes(operation.scale)) {
        next.scale = operation.scale as ScaleName;
      }
      break;

    case "set_swing":
      next.swing = clamp(operation.swing, 0, 0.6);
      break;

    case "add_section": {
      const s = operation.section;
      next.sections = next.sections.filter((x) => x.id !== s.id);
      next.sections.push({
        ...s,
        name: s.name.slice(0, 40),
        startBar: clamp(Math.round(s.startBar), 0, MAX_BARS - 1),
        lengthBars: clamp(Math.round(s.lengthBars), 1, MAX_BARS),
      });
      next.sections.sort((a, b) => a.startBar - b.startBar);
      break;
    }

    case "update_section": {
      const idx = next.sections.findIndex((x) => x.id === operation.section.id);
      if (idx >= 0) {
        const s = operation.section;
        next.sections[idx] = {
          ...s,
          name: s.name.slice(0, 40),
          startBar: clamp(Math.round(s.startBar), 0, MAX_BARS - 1),
          lengthBars: clamp(Math.round(s.lengthBars), 1, MAX_BARS),
        };
        next.sections.sort((a, b) => a.startBar - b.startBar);
      }
      break;
    }

    case "delete_section":
      next.sections = next.sections.filter((x) => x.id !== operation.section_id);
      break;

    case "add_track":
      next.tracks.push(operation.track);
      break;

    case "delete_track":
      if (next.tracks.length > 1) {
        next.tracks = next.tracks.filter((t) => t.id !== operation.track_id);
        next.automations = next.automations.filter(
          (a) => a.trackId !== operation.track_id,
        );
      }
      break;

    case "rename_track": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.name = operation.name.slice(0, 60);
      break;
    }

    case "set_track_mixer": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) {
        const m = operation.mixer;
        track.mixer = {
          volume: clamp(m.volume, 0, 1),
          pan: clamp(m.pan, -1, 1),
          muted: m.muted,
          solo: m.solo,
          delaySend: clamp(m.delaySend, 0, 1),
          reverbSend: clamp(m.reverbSend, 0, 1),
        };
      }
      break;
    }

    case "set_track_fx": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) {
        const f = operation.fx;
        track.fx = {
          filterType: f.filterType,
          filterHz: clamp(f.filterHz, 40, 18000),
          resonance: clamp(f.resonance, 0, 24),
          drive: clamp(f.drive, 0, 1),
          chorus: clamp(f.chorus, 0, 1),
        };
      }
      break;
    }

    case "set_track_kit": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track && track.kind === "drums") track.kit = operation.kit;
      break;
    }

    case "set_synth": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) {
        const s = operation.synth;
        track.synth = {
          ...s,
          attack: clamp(s.attack, 0.001, 4),
          decay: clamp(s.decay, 0.001, 4),
          sustain: clamp(s.sustain, 0.001, 1),
          release: clamp(s.release, 0.001, 8),
          cutoff: clamp(s.cutoff, 40, 18000),
          resonance: clamp(s.resonance, 0.01, 30),
          detune: clamp(s.detune, -100, 100),
          unison: clamp(Math.round(s.unison ?? 1), 1, 3),
          sub: clamp(s.sub ?? 0, 0, 1),
          glide: clamp(s.glide ?? 0, 0, 0.3),
        };
      }
      break;
    }

    case "set_sampler_asset": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.sampleId = operation.sample_id;
      break;
    }

    case "add_clip": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track && track.clips.length < 128) {
        const c = structuredClone(operation.clip);
        c.startBar = clamp(Math.round(c.startBar), 0, MAX_BARS - 1);
        c.lengthBars = clamp(Math.round(c.lengthBars), 1, MAX_BARS);
        c.patternSteps = c.lengthBars * next.stepsPerBar;
        track.clips.push(c);
      }
      break;
    }

    case "delete_clip": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.clips = track.clips.filter((c) => c.id !== operation.clip_id);
      break;
    }

    case "move_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) clip.startBar = clamp(Math.round(operation.start_bar), 0, next.bars - 1);
      break;
    }

    case "resize_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) {
        clip.lengthBars = clamp(Math.round(operation.length_bars), 1, next.bars);
        clip.patternSteps = clip.lengthBars * next.stepsPerBar;
        // trim notes/steps that now fall outside the clip
        if (clip.notes) {
          clip.notes = clip.notes.filter((n) => n.startStep < clip.patternSteps);
        }
      }
      break;
    }

    case "rename_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) clip.name = operation.name.slice(0, 60);
      break;
    }

    case "set_clip_groove": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) {
        if (typeof operation.swing === "number")
          clip.swing = clamp(operation.swing, 0, 0.6);
        if (typeof operation.humanize === "number")
          clip.humanize = clamp(operation.humanize, 0, 1);
      }
      break;
    }

    case "set_clip_notes": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) {
        const max = clip.patternSteps || clip.lengthBars * next.stepsPerBar;
        clip.notes = operation.notes
          .filter((n) => n.startStep >= 0 && n.startStep < max)
          .slice(0, 512)
          .map((n) => ({
            id: n.id || makeId("note"),
            note: clamp(Math.round(n.note), 0, 127),
            startStep: clamp(Math.round(n.startStep), 0, max - 1),
            durationSteps: clamp(Math.round(n.durationSteps), 1, max),
            velocity: clamp(Math.round(n.velocity), 1, 127),
          }));
      }
      break;
    }

    case "set_clip_drum_steps": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) {
        const max = clip.patternSteps || clip.lengthBars * next.stepsPerBar;
        const grid: Partial<Record<DrumVoice, boolean[]>> = {};
        for (const [voice, steps] of Object.entries(operation.drum_steps)) {
          if (!Array.isArray(steps)) continue;
          const row = Array.from({ length: max }, (_, i) => Boolean(steps[i]));
          grid[voice as DrumVoice] = row;
        }
        clip.drumSteps = grid;
      }
      break;
    }

    case "set_drum_step": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) {
        clip.drumSteps ??= {};
        const max = clip.patternSteps || clip.lengthBars * next.stepsPerBar;
        let steps = clip.drumSteps[operation.voice];
        if (!steps) {
          steps = Array(max).fill(false);
          clip.drumSteps[operation.voice] = steps;
        }
        if (operation.step >= 0 && operation.step < steps.length) {
          steps[operation.step] = operation.enabled;
        }
      }
      break;
    }

    case "set_note_cell": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (!clip) break;
      clip.notes ??= [];
      clip.notes = clip.notes.filter(
        (n) => !(n.startStep === operation.step && n.note === operation.note),
      );
      if (operation.enabled) {
        clip.notes.push({
          id: makeId("note"),
          note: clamp(operation.note, 0, 127),
          startStep: operation.step,
          durationSteps: Math.max(1, operation.duration_steps),
          velocity: clamp(operation.velocity, 1, 127),
        });
      }
      break;
    }

    case "set_sample_step": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (!clip) break;
      clip.sampleTriggers ??= [];
      clip.sampleTriggers = clip.sampleTriggers.filter((t) => t.step !== operation.step);
      if (operation.enabled) {
        clip.sampleTriggers.push({
          step: operation.step,
          velocity: clamp(operation.velocity, 1, 127),
        });
      }
      break;
    }

    case "add_automation": {
      const a = operation.automation;
      if (next.tracks.some((t) => t.id === a.trackId)) {
        next.automations = next.automations.filter(
          (x) => !(x.trackId === a.trackId && x.param === a.param),
        );
        next.automations.push({
          ...a,
          startBar: clamp(Math.round(a.startBar), 0, MAX_BARS),
          endBar: clamp(Math.round(a.endBar), 0, MAX_BARS),
          from: clamp(a.from, 0, 20000),
          to: clamp(a.to, 0, 20000),
        });
      }
      break;
    }

    case "clear_automation":
      next.automations = next.automations.filter(
        (a) => a.trackId !== operation.track_id,
      );
      break;

    case "add_sample_asset":
      if (!next.samples.some((s) => s.id === operation.asset.id)) {
        next.samples.push(operation.asset);
      }
      break;
  }

  return next;
}

function findClip(project: ProjectState, trackId: string, clipId: string) {
  return project.tracks
    .find((t) => t.id === trackId)
    ?.clips.find((c) => c.id === clipId);
}

/** Utilities shared by the piano roll + AI generators. */
export function humanizeNotes(
  notes: NoteEvent[],
  amount: number,
  maxStep: number,
): NoteEvent[] {
  if (amount <= 0) return notes;
  return notes.map((n) => {
    const jitter = Math.round((Math.random() * 2 - 1) * amount * 1.5);
    const velJitter = Math.round((Math.random() * 2 - 1) * amount * 22);
    return {
      ...n,
      startStep: Math.max(0, Math.min(maxStep - 1, n.startStep + jitter)),
      velocity: Math.max(1, Math.min(127, n.velocity + velJitter)),
    };
  });
}

export function quantizeNotes(notes: NoteEvent[], grid: number): NoteEvent[] {
  const g = Math.max(1, grid);
  return notes.map((n) => ({
    ...n,
    startStep: Math.round(n.startStep / g) * g,
  }));
}

export function newAutomation(input: Omit<Automation, "id">): Automation {
  return { id: makeId("auto"), ...input };
}
