import type { ProjectOperation, ProjectState } from "@/lib/model";

export type UserPresence = {
  clientId: number;
  username: string;
};

export type ClientMessage =
  | { type: "join"; project_id: string; username: string }
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
