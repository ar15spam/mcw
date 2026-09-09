import type { ProviderResponse, ProviderToolCall } from "@/lib/agent/types";

/**
 * Offline intent matcher — the co-producer's fallback when no LLM key is set.
 * Not a model: maps common phrasings to the same tool calls. Add
 * ANTHROPIC_API_KEY / OPENAI_API_KEY for real open-ended understanding.
 */

const call = (name: string, input: Record<string, unknown> = {}): ProviderToolCall => ({
  name,
  input,
});

const TRACK_WORDS =
  /\b(drums?|beat|bass|synth|lead|melody|chords?|pad|hats?|kick|snare|clap)\b/i;

type Rule = { test: RegExp; build: (m: RegExpMatchArray, track: string | null) => ProviderToolCall[] };

const RULES: Rule[] = [
  // full arrangements
  {
    test: /\b(full (track|song|arrangement)|arrange|make (me )?a (whole|complete|real) (song|track)|turn (this|it) into a (song|track|\d+ ?bar)|build (me )?an? (song|arrangement|track)|write (me )?a (song|track))\b/i,
    build: (m) => {
      const bars = Number(m[0].match(/(\d+)\s*bar/i)?.[1]) || 32;
      const mood =
        m.input?.toString().match(/dark|dreamy|electric|warm|bouncy|chill|aggressive|house|techno|trap|hip.?hop|dnb|afro/i)?.[0] ??
        undefined;
      return [call("arrange_song", { bars, ...(mood ? { mood: mood.replace(/[- ]/g, "_").toLowerCase() } : {}) })];
    },
  },
  { test: /\b(\d+)\s*bars?\b/i, build: (m) => [call("set_song_length", { bars: Number(m[1]) })] },
  { test: /\b(longer|extend|more bars)\b/i, build: () => [call("set_song_length", { bars: 32 })] },

  // sections
  { test: /\bbreakdown\b/i, build: () => [call("create_section", { kind: "breakdown" })] },
  { test: /\b(build ?up|build)\b/i, build: () => [call("create_section", { kind: "build" })] },
  { test: /\b(drop|chorus)\b/i, build: () => [call("create_section", { kind: "drop" })] },
  { test: /\b(intro|introduction)\b/i, build: () => [call("create_section", { kind: "intro" })] },
  { test: /\b(outro|ending)\b/i, build: () => [call("create_section", { kind: "outro" })] },

  // tempo / key / groove
  { test: /\b(\d{2,3})\s*bpm\b/i, build: (m) => [call("set_tempo", { bpm: Number(m[1]) })] },
  { test: /\b(faster|speed (it|this)? ?up|quicker)\b/i, build: () => [call("set_tempo", { direction: "faster", amount: "medium" })] },
  { test: /\b(slower|slow (it|this)? ?down)\b/i, build: () => [call("set_tempo", { direction: "slower", amount: "medium" })] },
  { test: /\b([a-g][#b]?)\s*(minor|major|dorian|phrygian|lydian|mixolydian)\b/i, build: (m) => [call("set_key", { key: `${m[1]} ${m[2]}` })] },
  { test: /\b(swing|shuffle|groov(e|y)|bounc)/i, build: () => [call("set_swing", { feel: "heavy" })] },
  { test: /\b(straight|no swing|tighten the groove)\b/i, build: () => [call("set_swing", { feel: "straight" })] },

  // moods
  { test: /\b(2\s?am|late[- ]?night|after hours)\b/i, build: () => [call("set_mood", { mood: "late_night" })] },
  { test: /\bhouse\b/i, build: () => [call("set_mood", { mood: "house" })] },
  { test: /\btechno\b/i, build: () => [call("set_mood", { mood: "techno" })] },
  { test: /\btrap\b/i, build: () => [call("set_mood", { mood: "trap" })] },
  { test: /\b(dnb|drum\s*(and|&|n)\s*bass)\b/i, build: () => [call("set_mood", { mood: "dnb" })] },
  { test: /\b(hip[- ]?hop|boom[- ]?bap|lo[- ]?fi)\b/i, build: () => [call("set_mood", { mood: "hip_hop" })] },
  { test: /\bafro(beat)?\b/i, build: () => [call("set_mood", { mood: "afrobeat" })] },
  { test: /\b(dark|darker|moody|ominous)\b/i, build: (_m, t) => (t ? [call("shape_sound", { track: t, brightness: -0.6, warmth: 0.3 })] : [call("set_mood", { mood: "dark" })]) },
  { test: /\b(dream|dreamy|ethereal|hazy)\b/i, build: () => [call("set_mood", { mood: "dreamy" })] },
  { test: /\b(electric|synthetic|futuristic)\b/i, build: (_m, t) => (t ? [call("shape_sound", { track: t, brightness: 0.7, movement: 0.4 })] : [call("set_mood", { mood: "electric" })]) },
  { test: /\b(warm|warmer|analog|cozy)\b/i, build: () => [call("set_mood", { mood: "warm" })] },
  { test: /\b(chill|relax|mellow|laid[- ]?back)\b/i, build: () => [call("set_mood", { mood: "chill" })] },
  { test: /\b(aggressive|harder|heavier|intense)\b/i, build: () => [call("set_mood", { mood: "aggressive" })] },

  // energy / density
  { test: /\b(more energy|energetic|exciting|hype|turn (it|this) up)\b/i, build: () => [call("set_energy", { direction: "more", amount: "medium" })] },
  { test: /\b(less energy|calm down|bring (it|this) down|mellow out)\b/i, build: () => [call("set_energy", { direction: "less", amount: "medium" })] },
  { test: /\bboring\b/i, build: () => [call("set_energy", { direction: "more", amount: "lots" })] },
  { test: /\b(less busy|too busy|simpler|simplify|strip (it|this) back|clean (it|this) up)\b/i, build: () => [call("adjust_drum_density", { direction: "simpler" })] },
  { test: /\b(busier|more busy|more going on|fill (it|this) out)\b/i, build: () => [call("adjust_drum_density", { direction: "busier" })] },

  // generate
  { test: /\b(add|write|make|give me).{0,20}\bbass/i, build: () => [call("generate_bassline", { feel: "driving" })] },
  { test: /\b(add|write|make|give me).{0,20}\b(beat|drums|drum pattern|groove)/i, build: () => [call("generate_drum_pattern", { style: "house", busyness: "medium" })] },
  { test: /\b(add|write|make|give me).{0,20}\b(chords?|progression|harmony)/i, build: () => [call("generate_chords", { style: "stab" })] },
  { test: /\b(add|write|make|give me).{0,20}\b(melod|lead|riff|hook|tune|something melodic)/i, build: () => [call("generate_melody", { mood: "hook" })] },
  { test: /\b(add|drop) (a )?(drum )?fill\b/i, build: () => [call("generate_fill", { bars: 1, intensity: 0.8 })] },

  // notes
  { test: /\b(up an? octave|octave up)\b/i, build: () => [call("edit_notes", { op: "octave_up" })] },
  { test: /\b(down an? octave|octave down)\b/i, build: () => [call("edit_notes", { op: "octave_down" })] },
  { test: /\bhumaniz/i, build: () => [call("edit_notes", { op: "humanize", humanize: 0.5 })] },
  { test: /\bquantiz|tighten (the )?timing\b/i, build: () => [call("edit_notes", { op: "quantize", grid: 2 })] },
  { test: /\b(higher|pitch (it|this) up)\b/i, build: () => [call("edit_notes", { op: "transpose", direction: "up", semitones: 3 })] },
  { test: /\b(lower|pitch (it|this) down)\b/i, build: () => [call("edit_notes", { op: "transpose", direction: "down", semitones: 3 })] },

  // clips
  { test: /\b(duplicate|copy) (this|the|that) (clip|part|loop)\b/i, build: () => [call("duplicate_clip", {})] },
  { test: /\b(vary|variation|change it up|evolve|don'?t just loop)\b/i, build: () => [call("create_clip_variation", {})] },

  // fx / automation
  { test: /\bopen (the |up )?(the )?filter\b/i, build: (_m, t) => [call("automate_parameter", { track: t ?? undefined, param: "cutoff", direction: "open" })] },
  { test: /\bclose (the )?filter\b/i, build: (_m, t) => [call("automate_parameter", { track: t ?? undefined, param: "cutoff", direction: "close" })] },
  { test: /\b(filter|low ?pass|high ?pass)\b/i, build: (_m, t) => [call("set_track_fx", { track: t ?? undefined, filter: "lowpass", filter_hz: 1200 })] },
  { test: /\b(distort|saturat|drive|grit|dirty|crunch)\b/i, build: (_m, t) => [call("set_track_fx", { track: t ?? undefined, drive: 0.5 })] },
  { test: /\b(chorus|wide[nr]?|widen)\b/i, build: (_m, t) => [call("set_track_fx", { track: t ?? undefined, chorus: 0.6 })] },
  { test: /\bfade (the )?(\w+) in\b/i, build: (m) => [call("automate_parameter", { track: m[2], param: "volume", direction: "in" })] },
  { test: /\bfade (the )?(\w+) out\b/i, build: (m) => [call("automate_parameter", { track: m[2], param: "volume", direction: "out" })] },
  { test: /\b(more space|more reverb|spacious|roomier)\b/i, build: (_m, t) => [call("set_reverb", { track: t ?? undefined, amount: "more" })] },
  { test: /\b(less reverb|drier|tighter|no reverb)\b/i, build: (_m, t) => [call("set_reverb", { track: t ?? undefined, amount: "less" })] },
  { test: /\bbright(er)?\b/i, build: (_m, t) => [call("shape_sound", { track: t ?? "lead", brightness: 0.6 })] },

  // mix
  { test: /\bmute (the )?(\w+)/i, build: (m) => [call("set_track_state", { track: m[2], mute: true })] },
  { test: /\bsolo (the )?(\w+)/i, build: (m) => [call("set_track_state", { track: m[2], solo: true })] },
  { test: /\bmake (the )?(\w+) (louder|quieter|softer)\b/i, build: (m) => [call("set_track_level", { track: m[2], direction: m[3] === "louder" ? "up" : "down" })] },
  { test: /\b(rename|call) (this|it|the project) (to )?["“]?([^"”]+?)["”]?$/i, build: (m) => [call("set_project_name", { name: m[4].trim() })] },
];

export function offlineIntent(message: string): ProviderResponse {
  const text = message.trim();
  const trackHint = text.match(TRACK_WORDS)?.[1]?.toLowerCase() ?? null;
  const track =
    trackHint === "hats" || trackHint === "hat" || trackHint === "kick" || trackHint === "snare" || trackHint === "clap"
      ? "drums"
      : trackHint;

  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) {
      // stash the whole text on the match for the arrange rule
      (m as RegExpMatchArray & { input?: string }).input = text;
      return { text: "", toolCalls: rule.build(m, track) };
    }
  }

  if (/what (does|is) (bpm|swing|a section|the key)/i.test(text)) {
    if (/bpm/i.test(text))
      return { text: "BPM is the tempo — how many beats play each minute.", toolCalls: [] };
    if (/swing/i.test(text))
      return { text: "Swing pushes every other beat slightly late, giving a bouncier feel.", toolCalls: [] };
    return { text: "Sections are labelled parts of the song — intro, build, drop, breakdown, outro.", toolCalls: [] };
  }

  return { text: "", toolCalls: [] };
}
