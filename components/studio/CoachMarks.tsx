"use client";

type Step = { label: string; done: boolean };

type Props = {
  steps: Step[];
  onDismiss: () => void;
};

export default function CoachMarks({ steps, onDismiss }: Props) {
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="coachMarks" role="note">
      <span className="coachTitle">Getting started</span>
      <ol>
        {steps.map((step) => (
          <li key={step.label} className={step.done ? "isDone" : ""}>
            <span className="coachTick" aria-hidden="true">
              {step.done ? "✓" : ""}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <button className="coachDismiss" onClick={onDismiss}>
        {doneCount === steps.length ? "Done" : "Dismiss"}
      </button>
    </div>
  );
}
