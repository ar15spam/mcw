"use client";

import { useMemo } from "react";
import type {
  ConnectionStatus,
  SaveStatus,
  UserPresence,
} from "@/lib/protocol";

type Props = {
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  users: UserPresence[];
  selfUserId: string | null;
  role: "owner" | "editor" | null;
  onReconnect: () => void;
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

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  idle: "Connecting…",
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "All changes saved",
  offline: "Offline — changes sync on reconnect",
};

export default function SessionBar({
  status,
  saveStatus,
  users,
  selfUserId,
  role,
  onReconnect,
}: Props) {
  const distinct = useMemo(() => {
    const seen = new Map<string, UserPresence>();
    for (const user of users) {
      if (!seen.has(user.userId)) seen.set(user.userId, user);
    }
    return [...seen.values()];
  }, [users]);

  const others = distinct.filter((u) => u.userId !== selfUserId).length;

  return (
    <section className={`panel sessionBar sessionBar-${status}`}>
      <div className="sessionBarLeft">
        <span className={`sessionDot sessionDot-${status}`} />
        <strong>{CONNECTION_LABEL[status]}</strong>
        {status === "offline" && (
          <button className="sessionRetry" onClick={onReconnect}>
            Retry
          </button>
        )}
      </div>

      <div className="sessionPresence">
        {distinct.length === 0 ? (
          <span className="sessionPresenceEmpty">
            {status === "connected" ? "Just you" : "…"}
          </span>
        ) : (
          <>
            <div className="sessionAvatars">
              {distinct.slice(0, 5).map((user) => (
                <span
                  key={user.userId}
                  className={`sessionAvatar ${
                    user.userId === selfUserId ? "isSelf" : ""
                  }`}
                  title={
                    user.userId === selfUserId
                      ? `${user.name} (you)`
                      : user.name
                  }
                >
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" />
                  ) : (
                    initials(user.name)
                  )}
                </span>
              ))}
            </div>
            <span className="sessionPresenceCount">
              {others === 0
                ? "Just you"
                : `You + ${others} collaborator${others === 1 ? "" : "s"}`}
            </span>
          </>
        )}
      </div>

      <div className={`sessionSave sessionSave-${saveStatus}`}>
        <span className="sessionSaveDot" />
        {SAVE_LABEL[saveStatus]}
        {role === "editor" && <span className="sessionRole">Editor</span>}
      </div>
    </section>
  );
}
