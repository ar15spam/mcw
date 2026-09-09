"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

type InvitePreview = {
  projectId: string;
  projectName: string;
  signedIn: boolean;
  alreadyMember: boolean;
  isOwner: boolean;
};

type Phase = "loading" | "invalid" | "signed-out" | "joining" | "error";

export default function JoinPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const joinAttempted = useRef(false);

  const next = `/join/${encodeURIComponent(projectId)}`;

  // Load the invite preview.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/join`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 404) throw new Error("invalid");
        if (!res.ok) throw new Error("error");
        return (await res.json()) as InvitePreview;
      })
      .then((body) => {
        if (cancelled) return;
        setPreview(body);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setPhase(cause.message === "invalid" ? "invalid" : "error");
        setErrorMessage(
          cause.message === "invalid"
            ? "This invite link is invalid, or the project was deleted."
            : "We couldn't load this invite. Try again in a moment.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Once we know the session + preview, either accept the invite or ask to sign in.
  useEffect(() => {
    if (!preview || isPending) return;

    if (!session?.user) {
      setPhase("signed-out");
      return;
    }

    if (joinAttempted.current) return;
    joinAttempted.current = true;
    setPhase("joining");

    fetch(`/api/projects/${encodeURIComponent(projectId)}/join`, {
      method: "POST",
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "join_failed");
        return body as { projectId: string };
      })
      .then(() => {
        router.replace(`/studio?project=${encodeURIComponent(projectId)}`);
      })
      .catch(() => {
        setPhase("error");
        setErrorMessage(
          "We couldn't add you to this project. It may have been deleted.",
        );
      });
  }, [preview, session?.user, isPending, projectId, router]);

  return (
    <main className="authPage joinPage">
      <section className="authPanel">
        <Link className="wordmark authWordmark" href="/">
          <span className="markBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          MIDICOLLAB
        </Link>

        <div className="joinCard">
          {(phase === "loading" || isPending) && <p>Loading invite…</p>}

          {phase === "invalid" && (
            <>
              <p className="eyebrow">INVITE</p>
              <h1>This invite isn&apos;t valid</h1>
              <p>{errorMessage}</p>
              <Link className="authSubmit" href="/dashboard">
                Go to your dashboard
              </Link>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="eyebrow">INVITE</p>
              <h1>Something went wrong</h1>
              <p>{errorMessage}</p>
              <button
                className="authSubmit"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </>
          )}

          {phase === "signed-out" && preview && (
            <>
              <p className="eyebrow">YOU&apos;VE BEEN INVITED</p>
              <h1>
                Collaborate on
                <br />
                <span>{preview.projectName}</span>
              </h1>
              <p>
                Sign in or create a free account to join this project and start
                making music together.
              </p>
              <div className="joinActions">
                <Link
                  className="authSubmit"
                  href={`/signup?next=${encodeURIComponent(next)}`}
                >
                  Create account ↗
                </Link>
                <Link
                  className="joinSecondary"
                  href={`/login?next=${encodeURIComponent(next)}`}
                >
                  Sign in
                </Link>
              </div>
            </>
          )}

          {phase === "joining" && preview && (
            <>
              <p className="eyebrow">INVITE</p>
              <h1>Joining {preview.projectName}…</h1>
              <p>Taking you to the studio.</p>
            </>
          )}
        </div>
      </section>

      <section className="authVisual" aria-hidden="true">
        <div className="authVisualMeta">
          <span>SHARED SESSION</span>
          <span>LIVE</span>
        </div>
        <h2>
          ONE ROOM.
          <br />
          <span>ONE SESSION.</span>
        </h2>
        <div className="authWaveform">
          {Array.from({ length: 62 }, (_, index) => (
            <i key={index} style={{ height: `${12 + ((index * 29) % 84)}%` }} />
          ))}
        </div>
      </section>
    </main>
  );
}
