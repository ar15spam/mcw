import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  account,
  project,
  projectMember,
  session,
  user,
  verification,
} from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const sql = neon(connectionString);

export const db = drizzle({
  client: sql,
  schema: {
    user,
    session,
    account,
    verification,
    project,
    projectMember,
  },
});
