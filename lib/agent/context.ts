import type { Clip, ProjectState, Track } from "@/lib/model";
import type { AgentSelection } from "@/lib/agent/types";

/** Human role label for a track, inferred from kind + name. */
export function trackRole(track: Track): string {
  const name = track.name.toLowerCase();
  if (track.kind === "drums") return "drums";
  if (track.kind === "sampler") return "sampler";
  if (name.includes("bass") || name.includes("sub")) return "bass";
  if (name.includes("chord") || name.includes("pad") || name.includes("stab") || name.includes("key"))
    return "chords";
  if (name.includes("lead") || name.includes("melody") || name.includes("arp") || name.includes("synth"))
    return "lead";
  return "lead";
}

function levelWord(volume: number): string {
  if (volume <= 0.001) return "silent";
  if (volume < 0.4) return "quiet";
  if (volume > 0.8) return "loud";
  return "normal";
}

function clipSummary(clip: Clip): string {
  if (clip.kind === "drum" && clip.drumSteps) {
    const hits = Object.values(clip.drumSteps).reduce(
      (n, row) => n + (row?.filter(Boolean).length ?? 0),
      0,
    );
    return hits === 0 ? "empty" : `${hits} hits`;
  }
  if (clip.notes) return clip.notes.length === 0 ? "empty" : `${clip.notes.length} notes`;
  if (clip.sampleTriggers) return `${clip.sampleTriggers.length} hits`;
  return clip.kind;
}

export function buildProjectSummary(
  project: ProjectState,
  selection: AgentSelection,
) {
  const selectedTrack =
    project.tracks.find((t) => t.id === selection.trackId) ?? null;
  const selectedClip =
    selectedTrack?.clips.find((c) => c.id === selection.clipId) ?? null;
  const selectedSection =
    project.sections?.find((s) => s.id === selection.sectionId) ?? null;

  return {
    name: project.name,
    tempo: project.bpm,
    key: `${project.key ?? "A"} ${project.scale ?? "minor"}`,
    swing: Math.round((project.swing ?? 0) * 100),
    bars: project.bars,
    sections:
      (project.sections ?? []).map(
        (s) => `${s.kind}@${s.startBar}-${s.startBar + s.lengthBars}`,
      ) || [],
    tracks: project.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      role: trackRole(track),
      loudness: levelWord(track.mixer.volume),
      muted: track.mixer.muted,
      sound: track.synth?.preset ?? track.kit,
      clips: track.clips.map(
        (c) => `${c.name}[bar ${c.startBar}-${c.startBar + c.lengthBars}, ${clipSummary(c)}]`,
      ),
    })),
    selected: {
      track: selectedTrack ? { name: selectedTrack.name, role: trackRole(selectedTrack) } : null,
      clip: selectedClip ? { name: selectedClip.name, kind: selectedClip.kind } : null,
      barRange:
        typeof selection.barStart === "number" && typeof selection.barEnd === "number"
          ? [selection.barStart, selection.barEnd]
          : null,
      section: selectedSection ? selectedSection.kind : null,
    },
  };
}

export const AGENT_SYSTEM_PROMPT = `You are the co-producer inside MIDICOLLAB, a collaborative browser music studio. The person may know nothing about music production — they describe how they want it to feel, you make it real by calling tools.

How to work:
- Always act. Prefer tools over talk. Only reply with plain text for genuine questions ("what did you change?", "what does swing mean?").
- Translate feeling into music yourself: "electric" = bright synth + hi-hat movement; "darker" = lower/rounder tone, minor, lower notes; "bouncier" = swing + syncopation; "2am" = sparse, hypnotic, spacious; "less busy" = lower density; "make it a real song" / "give me a full arrangement" = arrange_song.
- BIG requests ("make me a dark techno track", "turn this into a 32 bar song", "build a full arrangement") -> arrange_song with a mood and a length. It writes tempo, key, sections and per-section parts.
- SECTION requests ("turn bars 17-24 into a breakdown", "add a build before the drop") -> create_section with the bar range + kind.
- TARGETED requests -> the specific tool (generate_bassline, shape_sound, edit_notes, automate_parameter, ...).
- Respect the selection. "this" / "that" / "here" = the selected track, clip, bar range or section.
- Choose confidently. Don't ask clarifying questions unless the request is truly impossible.
- One short plain-language sentence for any text reply. Never "I'd be happy to help".
- You work with drums, bass and synths. No lyrics, vocals, or external audio.`;
