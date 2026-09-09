"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectionStatus,
  SaveStatus,
  UserPresence,
} from "@/lib/protocol";

type Props = {
  nameDraft: string;
  canEdit: boolean;
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  users: UserPresence[];
  selfUserId: string | null;
  role: "owner" | "editor" | null;
  onNameChange: (value: string) => void;
  onNameCommit: () => void;
  onNameFocus: () => void;
  onShare: () => void;
  onNewProject: () => void;
  onExport: () => void;
  onReconnect: () => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  idle: "Connecting",
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: "Saved",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline",
};

export default function StudioTopBar({
  nameDraft,
  canEdit,
  status,
  saveStatus,
  users,
  selfUserId,
  role,
  onNameChange,
  onNameCommit,
  onNameFocus,
  onShare,
  onNewProject,
  onExport,
  onReconnect,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const distinctUsers = useMemo(() => {
    const seen = new Map<string, UserPresence>();
    for (const u of users) if (!seen.has(u.userId)) seen.set(u.userId, u);
    return [...seen.values()];
  }, [users]);

  const others = distinctUsers.filter((u) => u.userId !== selfUserId).length;

  return (
    <header className="studioBar">
      <div className="studioBarLeft">
        <Link className="studioBarBrand" href="/dashboard" aria-label="Your projects">
          <span className="markBars studioMarkBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
        </Link>
        <span className="studioBarSlash">/</span>
        <input
          className="studioBarName"
          value={nameDraft}
          disabled={!canEdit}
          aria-label="Project name"
          onFocus={onNameFocus}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>

      <div className="studioBarRight">
        <button
          className={`studioBarStatus is-${status}`}
          onClick={status === "offline" ? onReconnect : undefined}
          title={status === "offline" ? "Reconnect" : STATUS_TEXT[status]}
        >
          <span className="studioBarDot" />
          <span className="studioBarStatusText">{STATUS_TEXT[status]}</span>
          <span className="studioBarSaveText">· {SAVE_TEXT[saveStatus]}</span>
        </button>

        {distinctUsers.length > 0 && (
          <div className="studioBarPresence" title={`${others + 1} in the room`}>
            {distinctUsers.slice(0, 4).map((u) => (
              <span
                key={u.userId}
                className={`studioBarAvatar ${u.userId === selfUserId ? "isSelf" : ""}`}
                title={u.userId === selfUserId ? `${u.name} (you)` : u.name}
              >
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.image} alt="" />
                ) : (
                  initials(u.name)
                )}
              </span>
            ))}
            {others > 0 && (
              <span className="studioBarPresenceCount">
                {others + 1}
              </span>
            )}
          </div>
        )}

        <button className="studioBarShare" onClick={onShare}>
          Share
        </button>

        <div className="studioBarMenu" ref={menuRef}>
          <button
            className="studioBarMenuButton"
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="studioBarMenuList">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNewProject();
                }}
              >
                New project
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onExport();
                }}
              >
                Export as audio
              </button>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                Leave to dashboard
              </Link>
              {role && (
                <span className="studioBarMenuRole">
                  You are {role === "owner" ? "the owner" : "an editor"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
