"use client";

import { useCallback, useRef, useState } from "react";
import type { ProjectOperation, ProjectState } from "@/lib/model";
import type { ServerMessage, UserPresence } from "@/lib/protocol";

export function useCollaboration(
  onProject: (project: ProjectState) => void,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);

  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8080/ws";

  const connect = useCallback(
    (projectId: string, username: string) => {
      socketRef.current?.close();

      setStatus("connecting");
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "join",
            project_id: projectId,
            username,
          }),
        );
      };

      socket.onmessage = (message) => {
        const data = JSON.parse(message.data) as ServerMessage;

        if (data.type === "joined") {
          setClientId(data.client_id);
          setUsers(data.users);
          onProject(data.project);
          setStatus("connected");
        } else if (data.type === "project_state") {
          onProject(data.project);
        } else if (data.type === "presence") {
          setUsers(data.users);
        } else if (data.type === "error") {
          console.error(data.message);
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        setStatus("disconnected");
        setUsers([]);
        setClientId(null);
      };

      socket.onerror = () => setStatus("disconnected");
    },
    [onProject, wsUrl],
  );

  const disconnect = useCallback(() => {
    socketRef.current?.close();
  }, []);

  const sendOperation = useCallback((operation: ProjectOperation) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: "project_operation", operation }));
    return true;
  }, []);

  return {
    status,
    users,
    clientId,
    connect,
    disconnect,
    sendOperation,
  };
}
