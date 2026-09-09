"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectOperation, ProjectState } from "@/lib/model";
import type {
  ConnectionStatus,
  SaveStatus,
  ServerMessage,
  UserPresence,
} from "@/lib/protocol";

type RealtimeUser = { id: string; name: string; image: string | null };

type TokenResponse = {
  token: string;
  expiresAt: number;
  wsUrl: string;
  role: "owner" | "editor";
  project: {
    id: string;
    name: string;
    bpm: number;
    bars: number;
    isPublic: boolean;
    ownerId: string;
  };
  user: RealtimeUser;
};

type Options = {
  projectId: string | null;
  enabled: boolean;
  onProject: (
    project: ProjectState,
    meta: { reason: "join" | "remote" },
  ) => void;
};

export type CollaborationApi = {
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  users: UserPresence[];
  clientId: number | null;
  self: RealtimeUser | null;
  role: "owner" | "editor" | null;
  error: string | null;
  /** true once we have connected at least once this session */
  everConnected: boolean;
  sendOperation: (operation: ProjectOperation) => void;
  reconnect: () => void;
};

const MAX_BACKOFF_MS = 15_000;
const WS_FALLBACK =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8080/ws";

export function useCollaboration({
  projectId,
  enabled,
  onProject,
}: Options): CollaborationApi {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [self, setSelf] = useState<RealtimeUser | null>(null);
  const [role, setRole] = useState<"owner" | "editor" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [everConnected, setEverConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<number | null>(null);
  const pendingRef = useRef<ProjectOperation[]>([]);
  const saveFlipRef = useRef<number | undefined>(undefined);
  const reconnectRef = useRef<() => void>(() => {});

  const onProjectRef = useRef(onProject);
  useEffect(() => {
    onProjectRef.current = onProject;
  }, [onProject]);

  const markSaved = useCallback(() => {
    if (saveFlipRef.current) window.clearTimeout(saveFlipRef.current);
    setSaveStatus((current) => (current === "offline" ? current : "saved"));
  }, []);

  useEffect(() => {
    if (!projectId || !enabled) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: number | undefined;
    let fatal = false;

    const cleanupSocket = () => {
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {
          /* already closed */
        }
        socket = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled || fatal) return;
      const delay =
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 800;
      attempt += 1;
      setStatus("reconnecting");
      retryTimer = window.setTimeout(() => void run(), delay);
    };

    const handleMessage = (raw: string, active: WebSocket) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(raw) as ServerMessage;
      } catch {
        return;
      }

      if (data.type === "joined") {
        attempt = 0;
        clientIdRef.current = data.client_id;
        setClientId(data.client_id);
        setUsers(data.users);
        setStatus("connected");
        setEverConnected(true);
        setError(null);
        onProjectRef.current(data.project, { reason: "join" });

        const queued = pendingRef.current;
        pendingRef.current = [];
        for (const operation of queued) {
          active.send(
            JSON.stringify({ type: "project_operation", operation }),
          );
        }
        setSaveStatus(queued.length ? "saving" : "idle");
      } else if (data.type === "project_state") {
        // Suppress the echo of our own optimistic operations, but still let it
        // flip the save indicator to "saved".
        if (data.sender_id !== clientIdRef.current) {
          onProjectRef.current(data.project, { reason: "remote" });
        }
        markSaved();
      } else if (data.type === "presence") {
        setUsers(data.users);
      } else if (data.type === "error") {
        setError(data.message);
      }
    };

    const run = async () => {
      if (cancelled) return;
      cleanupSocket();
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      let tokenData: TokenResponse;
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/token`,
          { method: "POST", cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}) as Record<string, string>);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            fatal = true;
            setError(
              body.error ||
                "You do not have access to this project, or it no longer exists.",
            );
            setStatus("offline");
            return;
          }
          throw new Error(body.error || `token request failed (${res.status})`);
        }
        tokenData = body as TokenResponse;
      } catch {
        if (!cancelled) scheduleRetry();
        return;
      }

      if (cancelled) return;

      setSelf(tokenData.user);
      setRole(tokenData.role);
      setError(null);

      const url = tokenData.wsUrl || WS_FALLBACK;
      let active: WebSocket;
      try {
        active = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      // The effect could have been torn down while we awaited the token.
      if (cancelled) {
        try {
          active.close();
        } catch {
          /* noop */
        }
        return;
      }
      socket = active;
      socketRef.current = active;

      active.onopen = () => {
        if (cancelled || socket !== active) return;
        active.send(
          JSON.stringify({
            type: "join",
            project_id: projectId,
            token: tokenData.token,
          }),
        );
      };

      active.onmessage = (event) => {
        if (cancelled || socket !== active) return;
        handleMessage(event.data as string, active);
      };

      active.onerror = () => {
        /* onclose fires next and drives the retry */
      };

      active.onclose = () => {
        if (cancelled || socket !== active) return;
        socket = null;
        socketRef.current = null;
        setUsers([]);
        setClientId(null);
        clientIdRef.current = null;
        if (fatal) {
          setStatus("offline");
          return;
        }
        scheduleRetry();
      };
    };

    reconnectRef.current = () => {
      attempt = 0;
      fatal = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      setError(null);
      void run();
    };

    void run();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (saveFlipRef.current) window.clearTimeout(saveFlipRef.current);
      cleanupSocket();
      socketRef.current = null;
      clientIdRef.current = null;
      setStatus("idle");
      setUsers([]);
      setClientId(null);
    };
  }, [projectId, enabled, markSaved]);

  const sendOperation = useCallback((operation: ProjectOperation) => {
    const sock = socketRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: "project_operation", operation }));
      setSaveStatus("saving");
      if (saveFlipRef.current) window.clearTimeout(saveFlipRef.current);
      // Fallback flip in case the echo is dropped.
      saveFlipRef.current = window.setTimeout(
        () => setSaveStatus((c) => (c === "saving" ? "saved" : c)),
        4000,
      );
    } else {
      if (pendingRef.current.length < 500) pendingRef.current.push(operation);
      setSaveStatus("offline");
    }
  }, []);

  const reconnect = useCallback(() => reconnectRef.current(), []);

  return {
    status,
    saveStatus,
    users,
    clientId,
    self,
    role,
    error,
    everConnected,
    sendOperation,
    reconnect,
  };
}
