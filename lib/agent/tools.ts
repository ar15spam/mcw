import type { ToolSchema } from "@/lib/agent/types";

const TRACK = {
  type: "string",
  description:
    'Track: "selected", a role ("drums"/"bass"/"chords"/"lead"), a name, or an id. Omit to auto-pick.',
};

const obj = (
  properties: Record<string, unknown>,
  required?: string[],
): ToolSchema["parameters"] => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required ? { required } : {}),
});

const DRUM_STYLES = [
  "four_on_floor", "house", "techno", "garage", "breakbeat",
  "boom_bap", "trap", "halftime", "dnb", "afro", "minimal",
];
const MOODS = [
  "dark", "dreamy", "electric", "warm", "bouncy", "chill", "aggressive",
  "late_night", "house", "techno", "hip_hop", "trap", "dnb", "afrobeat",
];
const SECTION_KINDS = ["intro", "groove", "build", "breakdown", "drop", "bridge", "outro"];
const PRESETS = [
  "deep_bass", "sub_bass", "reese_bass", "acid", "pluck", "lead", "saw_lead",
  "pad", "warm_pad", "organ", "ep", "stab", "bells",
];

export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: "arrange_song",
    description:
      "Compose a full multi-section arrangement from scratch: sets tempo, key, swing, song length, creates sections (intro/build/drop/breakdown/outro) and writes distinct drum/bass/chord/lead parts per section with an energy curve. Use for 'make me a full track', 'turn this into a 32 bar song', 'build a real arrangement'.",
    parameters: obj({
      mood: { type: "string", enum: MOODS },
      bars: { type: "integer", minimum: 8, maximum: 128, description: "total song length (default 32)" },
      bpm: { type: "integer", minimum: 60, maximum: 200 },
      key: { type: "string", description: 'e.g. "F minor", "A"' },
      scale: { type: "string" },
      swing: { type: "number", minimum: 0, maximum: 0.6 },
      progression: {
        type: "string",
        enum: Object.keys({
          minor_epic: 1, minor_loop: 1, andalusian: 1, pop_axis: 1,
          house_classic: 1, deep: 1, suspense: 1, bright: 1, jazzy: 1, static_tonic: 1,
        }),
      },
      name: { type: "string" },
      sections: {
        type: "array",
        description: "optional explicit plan; otherwise a template is chosen for the length",
        items: obj({
          kind: { type: "string", enum: SECTION_KINDS },
          bars: { type: "integer", minimum: 1, maximum: 64 },
          energy: { type: "number", minimum: 0, maximum: 1 },
        }),
      },
    }),
  },
  {
    name: "create_section",
    description:
      "Mark a range of bars as a section and give it that section's feel (e.g. a breakdown filters + drops the drums/bass; a build opens the filter and adds a fill). Use for 'turn bars 17–24 into a breakdown', 'add a build before the drop'.",
    parameters: obj(
      {
        kind: { type: "string", enum: SECTION_KINDS },
        start_bar: { type: "integer", minimum: 0 },
        length_bars: { type: "integer", minimum: 1, maximum: 64 },
        name: { type: "string" },
      },
      ["kind"],
    ),
  },
  {
    name: "update_section",
    description: "Rename or re-type the selected section.",
    parameters: obj({
      section_id: { type: "string" },
      kind: { type: "string", enum: SECTION_KINDS },
      name: { type: "string" },
    }),
  },
  {
    name: "delete_section",
    description: "Remove the selected section marker.",
    parameters: obj({ section_id: { type: "string" } }),
  },
  {
    name: "set_tempo",
    description: "Change tempo (BPM). Exact value or a direction + amount.",
    parameters: obj({
      bpm: { type: "integer", minimum: 40, maximum: 240 },
      direction: { type: "string", enum: ["faster", "slower"] },
      amount: { type: "string", enum: ["slight", "medium", "lots"] },
    }),
  },
  {
    name: "set_key",
    description: 'Set the musical key and/or scale, e.g. "C minor", "F# dorian".',
    parameters: obj({ key: { type: "string" }, scale: { type: "string" } }),
  },
  {
    name: "set_swing",
    description: "Set the groove / swing feel (0 = straight, up to heavy).",
    parameters: obj({
      amount: { type: "number", minimum: 0, maximum: 0.6 },
      feel: { type: "string", enum: ["straight", "light", "heavy"] },
      direction: { type: "string", enum: ["more", "less"] },
    }),
  },
  {
    name: "set_song_length",
    description: "Set the total number of bars in the song.",
    parameters: obj({ bars: { type: "integer", minimum: 1, maximum: 256 } }, ["bars"]),
  },
  {
    name: "set_project_name",
    description: "Rename the project.",
    parameters: obj({ name: { type: "string", maxLength: 80 } }, ["name"]),
  },
  {
    name: "add_track",
    description: "Add a track. 'drums' = beat, 'bass' = low end, 'synth' = melodic, 'sampler' = an uploaded sound.",
    parameters: obj(
      { kind: { type: "string", enum: ["drums", "bass", "synth", "sampler"] }, name: { type: "string" } },
      ["kind"],
    ),
  },
  {
    name: "remove_track",
    description: "Delete a track.",
    parameters: obj({ track: TRACK }, ["track"]),
  },
  {
    name: "generate_drum_pattern",
    description: "Write a drum beat on the drum track (over the selected bar range, or the whole song).",
    parameters: obj(
      {
        track: TRACK,
        style: { type: "string", enum: DRUM_STYLES },
        busyness: { type: "string", enum: ["sparse", "medium", "busy"] },
        syncopation: { type: "number", minimum: 0, maximum: 1 },
        swing: { type: "number", minimum: 0, maximum: 0.6 },
        fills: { type: "boolean" },
      },
      ["style"],
    ),
  },
  {
    name: "adjust_drum_density",
    description: "Make the existing beat busier or simpler without rewriting it.",
    parameters: obj(
      { track: TRACK, direction: { type: "string", enum: ["busier", "simpler"] } },
      ["direction"],
    ),
  },
  {
    name: "generate_fill",
    description: "Drop a drum fill (usually at the end of a section).",
    parameters: obj({
      track: TRACK,
      bars: { type: "integer", minimum: 1, maximum: 2 },
      at_bar: { type: "integer", minimum: 0 },
      intensity: { type: "number", minimum: 0, maximum: 1 },
    }),
  },
  {
    name: "generate_bassline",
    description: "Write a bassline on the bass track.",
    parameters: obj({
      track: TRACK,
      feel: { type: "string", enum: ["sub", "driving", "offbeat", "walking", "rolling", "arp", "dub"] },
      octave: { type: "string", enum: ["low", "mid"] },
      density: { type: "string", enum: ["sparse", "medium", "busy"] },
    }),
  },
  {
    name: "generate_chords",
    description: "Write a chord part on the chords track.",
    parameters: obj({
      track: TRACK,
      style: { type: "string", enum: ["pad", "stab", "arp", "piano"] },
      progression: {
        type: "string",
        enum: ["minor_epic", "minor_loop", "andalusian", "pop_axis", "house_classic", "deep", "suspense", "bright", "jazzy", "static_tonic"],
      },
    }),
  },
  {
    name: "generate_melody",
    description: "Write a melodic line / hook on the lead track.",
    parameters: obj({
      track: TRACK,
      mood: { type: "string", enum: ["bright", "dark", "dreamy", "tense", "playful", "simple", "hook"] },
      density: { type: "string", enum: ["sparse", "medium", "busy"] },
      octave: { type: "string", enum: ["low", "mid"] },
    }),
  },
  {
    name: "edit_notes",
    description:
      "Transform the notes of the selected melodic clip: transpose, octave up/down, quantize, humanize, thin out, or double up.",
    parameters: obj({
      track: TRACK,
      op: { type: "string", enum: ["transpose", "octave_up", "octave_down", "quantize", "humanize", "thin", "double"] },
      semitones: { type: "integer", minimum: -24, maximum: 24 },
      direction: { type: "string", enum: ["up", "down", "sparser"] },
      amount: { type: "string", enum: ["little", "octave"] },
      humanize: { type: "number", minimum: 0, maximum: 1 },
      grid: { type: "integer", minimum: 1, maximum: 8 },
    }),
  },
  {
    name: "move_clip",
    description: "Move the selected clip along the timeline.",
    parameters: obj({
      track: TRACK,
      to_bar: { type: "integer", minimum: 0 },
      direction: { type: "string", enum: ["left", "right"] },
      bars: { type: "integer", minimum: 1 },
    }),
  },
  {
    name: "resize_clip",
    description: "Change the length of the selected clip.",
    parameters: obj({ track: TRACK, length_bars: { type: "integer", minimum: 1, maximum: 64 } }),
  },
  {
    name: "duplicate_clip",
    description: "Copy the selected clip to a later bar.",
    parameters: obj({ track: TRACK, at_bar: { type: "integer", minimum: 0 } }),
  },
  {
    name: "create_clip_variation",
    description: "Make a subtly different version of the selected clip and place it after it — so the idea evolves instead of looping.",
    parameters: obj({ track: TRACK, at_bar: { type: "integer", minimum: 0 } }),
  },
  {
    name: "delete_clip",
    description: "Delete the selected clip.",
    parameters: obj({ track: TRACK }),
  },
  {
    name: "shape_sound",
    description:
      "Reshape a synth's tone. Each field is a signed amount -1..1. brightness, warmth, space (reverb+tails), movement (detune/unison), energy (attack).",
    parameters: obj({
      track: TRACK,
      brightness: { type: "number", minimum: -1, maximum: 1 },
      warmth: { type: "number", minimum: -1, maximum: 1 },
      space: { type: "number", minimum: -1, maximum: 1 },
      movement: { type: "number", minimum: -1, maximum: 1 },
      energy: { type: "number", minimum: -1, maximum: 1 },
    }),
  },
  {
    name: "set_instrument",
    description: "Swap a synth track to a different preset sound.",
    parameters: obj({ track: TRACK, character: { type: "string", enum: PRESETS } }, ["character"]),
  },
  {
    name: "set_drum_kit",
    description: "Change the drum kit character.",
    parameters: obj(
      { track: TRACK, kit: { type: "string", enum: ["house", "acoustic", "eight08", "lofi", "techno"] } },
      ["kit"],
    ),
  },
  {
    name: "set_track_fx",
    description: "Set a track's effects: filter type + cutoff, drive (saturation/distortion), chorus, resonance.",
    parameters: obj({
      track: TRACK,
      filter: { type: "string", enum: ["off", "lowpass", "highpass", "bandpass"] },
      filter_hz: { type: "number", minimum: 40, maximum: 18000 },
      resonance: { type: "number", minimum: 0, maximum: 24 },
      drive: { type: "number", minimum: 0, maximum: 1 },
      chorus: { type: "number", minimum: 0, maximum: 1 },
    }),
  },
  {
    name: "set_track_level",
    description: "Change how loud a track is.",
    parameters: obj(
      {
        track: TRACK,
        level: { type: "string", enum: ["mute", "quiet", "normal", "loud"] },
        direction: { type: "string", enum: ["up", "down"] },
      },
      ["track"],
    ),
  },
  {
    name: "set_track_state",
    description: "Mute or solo a track.",
    parameters: obj({ track: TRACK, mute: { type: "boolean" }, solo: { type: "boolean" } }, ["track"]),
  },
  {
    name: "set_reverb",
    description: "Add or reduce the sense of space on a track.",
    parameters: obj({ track: TRACK, amount: { type: "string", enum: ["more", "less", "none"] } }, ["amount"]),
  },
  {
    name: "automate_parameter",
    description:
      "Ramp a parameter over a bar range, e.g. 'open the filter over the next 8 bars', 'fade the bass in'. param: cutoff|volume|reverb|delay|drive|pan.",
    parameters: obj({
      track: TRACK,
      param: { type: "string", enum: ["cutoff", "volume", "reverb", "delay", "drive", "pan"] },
      direction: { type: "string", enum: ["open", "close", "up", "down", "in", "out"] },
      start_bar: { type: "integer", minimum: 0 },
      end_bar: { type: "integer", minimum: 1 },
      from: { type: "number" },
      to: { type: "number" },
      curve: { type: "string", enum: ["linear", "exp"] },
    }),
  },
  {
    name: "set_mood",
    description: "Re-cast the current loop toward a named feeling (tempo, key, groove, bass, chords, tone). For 8-bar recolours, not full arrangements.",
    parameters: obj({ mood: { type: "string", enum: MOODS } }, ["mood"]),
  },
  {
    name: "set_energy",
    description: "Raise or lower overall energy: tempo + drum density + brightness together.",
    parameters: obj(
      { direction: { type: "string", enum: ["more", "less"] }, amount: { type: "string", enum: ["slight", "medium", "lots"] } },
      ["direction"],
    ),
  },
];

export const AGENT_TOOL_NAMES = new Set([
  ...AGENT_TOOLS.map((t) => t.name),
  // aliases handled by the executor dispatch
  "set_scale",
  "set_chord_progression",
  "transpose",
  "humanize",
]);
