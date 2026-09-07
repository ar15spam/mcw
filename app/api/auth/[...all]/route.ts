import { toNextJsHandler } from "better-auth/next-js";

function configError() {
  return Response.json(
    {
      error: "Auth is not configured yet. Add DATABASE_URL and BETTER_AUTH_SECRET.",
    },
    { status: 503 },
  );
}

async function handlers() {
  const { auth } = await import("@/lib/auth");
  return toNextJsHandler(auth);
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return configError();
  const handler = await handlers();
  return handler.GET(request);
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return configError();
  const handler = await handlers();
  return handler.POST(request);
}
