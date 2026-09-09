import type { ProjectOperation, ProjectState } from "@/lib/model";
import { makeId } from "@/lib/default-project";

export function applyOperation(
  current: ProjectState,
  operation: ProjectOperation,
): ProjectState {
  const next = structuredClone(current);
  next.revision += 1;

  switch (operation.type) {
    case "rename_project":
      next.name = operation.name.slice(0, 80);
      break;

    case "set_bpm":
      next.bpm = Math.max(50, Math.min(220, operation.bpm));
      break;

    case "set_bars":
      next.bars = Math.max(1, Math.min(64, operation.bars));
      next.loopEndBar = Math.min(next.loopEndBar, next.bars);
      if (next.loopEndBar <= next.loopStartBar) {
        next.loopStartBar = 0;
        next.loopEndBar = next.bars;
      }
      break;

    case "set_playing":
      next.playing = operation.playing;
      next.startAtMs = operation.playing ? operation.start_at_ms : null;
      break;

    case "set_loop":
      next.loopStartBar = Math.max(0, operation.start_bar);
      next.loopEndBar = Math.max(next.loopStartBar + 1, Math.min(next.bars, operation.end_bar));
      break;

    case "set_master_volume":
      next.masterVolume = Math.max(0, Math.min(1, operation.volume));
      break;

    case "set_public":
      next.isPublic = operation.is_public;
      break;

    case "add_track":
      next.tracks.push(operation.track);
      break;

    case "delete_track":
      next.tracks = next.tracks.filter((track) => track.id !== operation.track_id);
      break;

    case "rename_track": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.name = operation.name.slice(0, 60);
      break;
    }

    case "set_track_mixer": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.mixer = operation.mixer;
      break;
    }

    case "set_synth": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.synth = operation.synth;
      break;
    }

    case "set_sampler_asset": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.sampleId = operation.sample_id;
      break;
    }

    case "add_clip": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.clips.push(operation.clip);
      break;
    }

    case "delete_clip": {
      const track = next.tracks.find((t) => t.id === operation.track_id);
      if (track) track.clips = track.clips.filter((c) => c.id !== operation.clip_id);
      break;
    }

    case "move_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) clip.startBar = Math.max(0, Math.min(next.bars - 1, operation.start_bar));
      break;
    }

    case "resize_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) clip.lengthBars = Math.max(1, Math.min(next.bars, operation.length_bars));
      break;
    }

    case "rename_clip": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (clip) clip.name = operation.name.slice(0, 60);
      break;
    }

    case "set_drum_step": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      const steps = clip?.drumSteps?.[operation.voice];
      if (steps && operation.step >= 0 && operation.step < steps.length) {
        steps[operation.step] = operation.enabled;
      }
      break;
    }

    case "set_note_cell": {
      const clip = findClip(next, operation.track_id, operation.clip_id);
      if (!clip?.notes) break;

      clip.notes = clip.notes.filter(
        (n) => !(n.startStep === operation.step && n.note === operation.note),
      );

      if (operation.enabled) {
        clip.notes.push({
          id: makeId("note"),
          note: operation.note,
          startStep: operation.step,
          durationSteps: Math.max(1, operation.duration_steps),
          velocity: Math.max(1, Math.min(127, operation.velocity)),
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
          velocity: Math.max(1, Math.min(127, operation.velocity)),
        });
      }
      break;
    }

    case "add_sample_asset":
      if (!next.samples.some((sample) => sample.id === operation.asset.id)) {
        next.samples.push(operation.asset);
      }
      break;
  }

  return next;
}

function findClip(project: ProjectState, trackId: string, clipId: string) {
  return project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
}
