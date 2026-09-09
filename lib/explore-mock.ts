/**
 * MOCK DATA ONLY — the Explore page is a product preview.
 * None of this touches the database or the real project model. When a public
 * discovery API exists, replace `EXPLORE_SESSIONS` with a fetch and delete this
 * file. Nothing else imports it.
 */

export type ExploreSession = {
  id: string;
  title: string;
  creator: string;
  genre: string;
  mood: string;
  bpm: number;
  bars: number;
  live: boolean;
  color: "blue" | "violet" | "cyan" | "orange" | "lime" | "red";
};

export const EXPLORE_MOODS = [
  "Dark",
  "Dreamy",
  "Electric",
  "Warm",
  "Bouncy",
  "Chill",
  "Aggressive",
  "Late Night",
];

export const EXPLORE_GENRES = [
  "House",
  "Techno",
  "Hip-Hop",
  "R&B",
  "Garage",
  "Ambient",
  "DnB",
];

export const EXPLORE_SESSIONS: ExploreSession[] = [
  { id: "night-drive", title: "Night drive sketches", creator: "mara.wav", genre: "House", mood: "Late Night", bpm: 124, bars: 16, live: true, color: "blue" },
  { id: "soft-focus", title: "Soft focus / 02", creator: "juniper", genre: "Ambient", mood: "Dreamy", bpm: 96, bars: 8, live: false, color: "violet" },
  { id: "concrete-gardens", title: "Concrete gardens", creator: "kaito", genre: "Techno", mood: "Aggressive", bpm: 132, bars: 32, live: true, color: "orange" },
  { id: "afterimage", title: "Afterimage", creator: "sol.8", genre: "R&B", mood: "Warm", bpm: 88, bars: 8, live: false, color: "cyan" },
  { id: "late-checkout", title: "Late checkout", creator: "milo", genre: "Garage", mood: "Bouncy", bpm: 138, bars: 16, live: false, color: "lime" },
  { id: "dust-lens", title: "Dust on the lens", creator: "northstar", genre: "Hip-Hop", mood: "Chill", bpm: 92, bars: 12, live: false, color: "red" },
  { id: "ion-field", title: "Ion field", creator: "vela", genre: "Techno", mood: "Electric", bpm: 130, bars: 16, live: true, color: "blue" },
  { id: "low-tide", title: "Low tide", creator: "brine", genre: "Ambient", mood: "Dark", bpm: 74, bars: 8, live: false, color: "violet" },
];
