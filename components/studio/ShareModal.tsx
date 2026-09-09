"use client";

import { useEffect, useState } from "react";

export type ProjectMember = {
  id: string;
  name: string;
  image: string | null;
  role: "owner" | "editor";
};

type Props = {
  projectId: string;
  projectName: string;
  isPublic: boolean;
  role: "owner" | "editor" | null;
  members: ProjectMember[];
  onClose: () => void;
  onTogglePublic: (next: boolean) => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ShareModal({
  projectId,
  projectName,
  isPublic,
  role,
  members,
  onClose,
  onTogglePublic,
}: Props) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"invite" | "public" | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inviteLink = `${origin}/join/${projectId}`;
  const publicLink = `${origin}/p/${projectId}`;

  async function copy(value: string, which: "invite" | "public") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div
      className="shareOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Share project"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="shareModal">
        <header className="shareModalHead">
          <div>
            <p className="eyebrow">INVITE COLLABORATORS</p>
            <h2>{projectName}</h2>
          </div>
          <button className="shareClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="shareHint">
          Anyone with this link can join this project and edit it with you.
        </p>

        <div className="shareLinkRow">
          <input readOnly value={inviteLink} aria-label="Invite link" />
          <button onClick={() => copy(inviteLink, "invite")}>
            {copied === "invite" ? "Copied" : "Copy link"}
          </button>
        </div>

        <ul className="shareMembers">
          {members.map((member) => (
            <li key={member.id}>
              <span className="shareAvatar" aria-hidden="true">
                {member.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.image} alt="" />
                ) : (
                  initials(member.name)
                )}
              </span>
              <span className="shareMemberName">{member.name}</span>
              <span className="shareMemberRole">
                {member.role === "owner" ? "Owner" : "Editor"}
              </span>
            </li>
          ))}
        </ul>

        <div className="sharePublic">
          <div>
            <strong>Public listen link</strong>
            <small>
              A read-only player. Listeners can hear the project but cannot edit.
            </small>
          </div>
          <label className="shareToggle" aria-disabled={role !== "owner"}>
            <input
              type="checkbox"
              checked={isPublic}
              disabled={role !== "owner"}
              onChange={(event) => onTogglePublic(event.target.checked)}
            />
            <span>{isPublic ? "On" : "Off"}</span>
          </label>
        </div>

        {isPublic && (
          <div className="shareLinkRow">
            <input readOnly value={publicLink} aria-label="Public link" />
            <button onClick={() => copy(publicLink, "public")}>
              {copied === "public" ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {role !== "owner" && (
          <p className="shareNote">Only the project owner can change sharing.</p>
        )}
      </div>
    </div>
  );
}
