import type { ProjectOperation, ProjectState } from "@/lib/model";

export type UserPresence = {
  clientId: number;
  userId: string;
  name: string;
  image: string | null;
};

export type ClientMessage =
  | { type: "join"; project_id: string; token: string }
  | { type: "project_operation"; operation: ProjectOperation };

export type ServerMessage =
  | {
      type: "joined";
      client_id: number;
      project: ProjectState;
      users: UserPresence[];
    }
  | {
      type: "project_state";
      sender_id: number;
      project: ProjectState;
    }
  | {
      type: "presence";
      users: UserPresence[];
    }
  | { type: "error"; message: string };

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export type SaveStatus = "idle" | "saving" | "saved" | "offline";
