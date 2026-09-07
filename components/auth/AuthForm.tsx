"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Props = {
  mode: "signup" | "login";
};

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      if (isSignup) {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: "/dashboard",
        });

        if (result.error) throw new Error(result.error.message);
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: "/dashboard",
        });

        if (result.error) throw new Error(result.error.message);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      setStatus("idle");
    }
  }

  async function signInWithGoogle() {
    if (!googleEnabled) {
      setError("Google sign-in is not configured yet. Add the Google OAuth env vars first.");
      return;
    }

    setError("");
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  return (
    <div className="authFormWrap">
      <div className="authFormIntro">
        <p>{isSignup ? "NEW ACCOUNT / 001" : "WELCOME BACK / 001"}</p>
        <h1>{isSignup ? "CREATE YOUR\nSESSION ID." : "GET BACK\nIN THE ROOM."}</h1>
        <span>
          {isSignup
            ? "One account for your projects, collaborators and sessions."
            : "Your projects and recent sessions are waiting."}
        </span>
      </div>

      <form className="authForm" onSubmit={submit}>
        {isSignup && (
          <label>
            <span>DISPLAY NAME</span>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Aaron"
            />
          </label>
        )}

        <label>
          <span>EMAIL</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
          />
        </label>

        <label>
          <span>PASSWORD</span>
          <input
            required
            minLength={8}
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8+ characters"
          />
        </label>

        {error && <div className="authError">{error}</div>}

        <button className="authSubmit" type="submit" disabled={status === "loading"}>
          {status === "loading"
            ? "WORKING..."
            : isSignup
              ? "CREATE ACCOUNT ↗"
              : "SIGN IN ↗"}
        </button>

        <div className="authOr"><span />OR<span /></div>

        <button className="authSocial" type="button" onClick={signInWithGoogle}>
          <span className="googleGlyph">G</span>
          CONTINUE WITH GOOGLE
          {!googleEnabled && <small>SETUP REQUIRED</small>}
        </button>

        <p className="authSwitch">
          {isSignup ? "ALREADY HAVE AN ACCOUNT?" : "NEW TO MIDICOLLAB?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "SIGN IN →" : "CREATE ONE →"}
          </Link>
        </p>
      </form>
    </div>
  );
}
