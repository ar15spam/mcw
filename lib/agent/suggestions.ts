import type { ProjectState } from "@/lib/model";
import { trackRole } from "@/lib/agent/context";

/** Contextual prompts for the composer, based on the project + selection. */
export function buildSuggestions(
  project: ProjectState | null,
  selection?: { barStart?: number | null; barEnd?: number | null; sectionId?: string | null },
): string[] {
  if (!project) {
    return ["Make me a full house track", "Start something dark and electric", "Write a 32 bar song"];
  }

  const hasRange =
    typeof selection?.barStart === "number" && typeof selection?.barEnd === "number";
  if (hasRange || selection?.sectionId) {
    return [
      "Turn this into a breakdown",
      "Make this a build",
      "Make this section busier",
      "Drop the drums here",
      "Add a fill at the end",
    ];
  }

  const roles = project.tracks.map(trackRole);
  const drums = project.tracks.find((t) => t.kind === "drums");
  const drumHits = drums?.clips[0]?.drumSteps
    ? Object.values(drums.clips[0].drumSteps).reduce(
        (n, row) => n + (row?.filter(Boolean).length ?? 0),
        0,
      )
    : 0;
  const short = project.bars <= 8;

  const out: string[] = [];
  if (short) out.push("Turn this into a full 32-bar song");
  if (!drums || drumHits === 0) out.push("Add a beat");
  else out.push("Make the drums bounce");
  if (!roles.includes("bass")) out.push("Add a bassline");
  out.push(
    "Add a breakdown",
    "Make it more electric",
    "Open the filter over 8 bars",
    "Turn it into techno",
    "Give the lead more movement",
    "Make this darker",
  );
  return [...new Set(out)].slice(0, 8);
}
