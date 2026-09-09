"use client";

import { useEffect, useState } from "react";
import ClipEditor from "@/components/ClipEditor";
import SoundPanel from "@/components/studio/SoundPanel";
import MixPanel from "@/components/studio/MixPanel";
import AgentPanel from "@/components/studio/AgentPanel";
import type { Clip, ProjectOperation, ProjectState, Section, Track } from "@/lib/model";
import type { CoproducerMessage } from "@/hooks/useCoproducer";

type Tab = "clip" | "sound" | "mix" | "ai";

type Props = {
  project: ProjectState;
  track: Track | null;
  clip: Clip | null;
  commit: (op: ProjectOperation) => void;
  canEdit: boolean;
  selectedRange: { start: number; end: number } | null;
  selectedSection: Section | null;
  agentMessages: CoproducerMessage[];
  agentSuggestions: string[];
  agentConfigured: boolean | null;
  onAsk: (text: string) => void;
};

const clipWord = (clip: Clip | null) => {
  if (!clip) return "Clip";
  if (clip.kind === "drum") return "Beat";
  if (clip.kind === "notes") return "Melody";
  return "Sample";
};

export default function ContextPanel({
  project,
  track,
  clip,
  commit,
  canEdit,
  selectedRange,
  selectedSection,
  agentMessages,
  agentSuggestions,
  agentConfigured,
  onAsk,
}: Props) {
  const [tab, setTab] = useState<Tab>("clip");
  const [manual, setManual] = useState(false);
  const rangeActive = Boolean(selectedRange || selectedSection);

  // Follow the selection until the user manually picks a tab.
  useEffect(() => {
    if (manual) return;
    if (rangeActive) setTab("ai");
    else if (clip) setTab("clip");
    else if (track) setTab("sound");
    else setTab("ai");
  }, [clip, track, manual, rangeActive]);

  const pick = (next: Tab) => {
    setManual(true);
    setTab(next);
  };

  return (
    <section className="contextPanel">
      <div className="contextTabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "clip"}
          className={tab === "clip" ? "isActive" : ""}
          onClick={() => pick("clip")}
        >
          {clipWord(clip)}
        </button>
        <button
          role="tab"
          aria-selected={tab === "sound"}
          className={tab === "sound" ? "isActive" : ""}
          onClick={() => pick("sound")}
        >
          Sound
        </button>
        <button
          role="tab"
          aria-selected={tab === "mix"}
          className={tab === "mix" ? "isActive" : ""}
          onClick={() => pick("mix")}
        >
          Mix
        </button>
        <button
          role="tab"
          aria-selected={tab === "ai"}
          className={`contextTabAi ${tab === "ai" ? "isActive" : ""}`}
          onClick={() => pick("ai")}
        >
          ✦ Co-producer
        </button>
      </div>

      {rangeActive && (
        <div className="contextRange">
          <span>
            {selectedSection
              ? `${selectedSection.name} · bars ${selectedSection.startBar + 1}–${selectedSection.startBar + selectedSection.lengthBars}`
              : `Bars ${selectedRange!.start + 1}–${selectedRange!.end} selected`}
          </span>
          <small>Ask the co-producer to change just this part.</small>
        </div>
      )}

      <div className="contextBody">
        {tab === "clip" && (
          <ClipEditor
            project={project}
            track={track}
            clip={clip}
            commit={commit}
          />
        )}
        {tab === "sound" && (
          <SoundPanel
            project={project}
            track={track}
            commit={commit}
            canEdit={canEdit}
          />
        )}
        {tab === "mix" && (
          <MixPanel track={track} commit={commit} canEdit={canEdit} />
        )}
        {tab === "ai" && (
          <AgentPanel
            messages={agentMessages}
            suggestions={agentSuggestions}
            configured={agentConfigured}
            onAsk={onAsk}
          />
        )}
      </div>
    </section>
  );
}
