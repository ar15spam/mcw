"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  EXPLORE_GENRES,
  EXPLORE_MOODS,
  EXPLORE_SESSIONS,
  type ExploreSession,
} from "@/lib/explore-mock";

function Pattern({ color, seed }: { color: string; seed: number }) {
  return (
    <div className={`explorePattern is-${color}`} aria-hidden="true">
      {Array.from({ length: 32 }, (_, i) => (
        <i key={i} className={(i * 7 + seed) % 9 < 3 ? "on" : ""} />
      ))}
    </div>
  );
}

function SessionCard({ session, index }: { session: ExploreSession; index: number }) {
  return (
    <article className="exploreCard">
      <Pattern color={session.color} seed={index} />
      <div className="exploreCardInfo">
        <div>
          <span className="exploreCardTag">
            {session.live ? "● Live now" : session.mood}
          </span>
          <h3>{session.title}</h3>
          <p>
            {session.creator} · {session.genre}
          </p>
        </div>
        <span className="exploreCardMeta">
          {session.bpm} BPM · {session.bars} bars
        </span>
      </div>
    </article>
  );
}

export default function ExplorePage() {
  const [mood, setMood] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      EXPLORE_SESSIONS.filter(
        (s) =>
          (!mood || s.mood === mood) &&
          (!genre || s.genre === genre) &&
          `${s.title} ${s.creator}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [mood, genre, query],
  );

  const live = EXPLORE_SESSIONS.filter((s) => s.live);

  return (
    <main className="explore">
      <div className="landingAtmos" aria-hidden="true" />

      <nav className="landingNav">
        <Link className="wordmark" href="/dashboard">
          <span className="markBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          MIDICOLLAB
        </Link>
        <div className="landingNavLinks">
          <Link href="/dashboard">Projects</Link>
          <span className="active">Explore</span>
        </div>
        <Link className="landingNavCta" href="/dashboard">
          Your workspace
        </Link>
      </nav>

      <header className="exploreHeader">
        <span className="landingIndex">COMMUNITY · PREVIEW</span>
        <h1>Explore</h1>
        <p>Find a sound, follow a thread, make something with someone new.</p>
        <label className="exploreSearch">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions or creators"
            aria-label="Search sessions or creators"
          />
        </label>
      </header>

      <section className="exploreRailBlock">
        <h2>Moods</h2>
        <div className="exploreRail">
          {EXPLORE_MOODS.map((m) => (
            <button
              key={m}
              className={mood === m ? "isActive" : ""}
              onClick={() => setMood(mood === m ? null : m)}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="exploreRailBlock">
        <h2>Genres</h2>
        <div className="exploreRail">
          {EXPLORE_GENRES.map((g) => (
            <button
              key={g}
              className={genre === g ? "isActive" : ""}
              onClick={() => setGenre(genre === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <section className="exploreSection">
        <div className="exploreSectionHead">
          <h2>{mood || genre ? "Matching sessions" : "New from the community"}</h2>
          <span>{filtered.length} sessions</span>
        </div>
        <div className="exploreGrid">
          {filtered.map((s, i) => (
            <SessionCard key={s.id} session={s} index={i} />
          ))}
          {filtered.length === 0 && (
            <p className="exploreEmpty">Nothing here yet — clear a filter.</p>
          )}
        </div>
      </section>

      {live.length > 0 && (
        <section className="exploreSection">
          <div className="exploreSectionHead">
            <h2>Live now</h2>
          </div>
          <div className="exploreLive">
            {live.map((s) => (
              <div key={s.id}>
                <span className="livePulse" />
                <strong>{s.title}</strong>
                <span>{s.creator}</span>
                <b>{s.bpm} BPM</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="exploreDisclaimer">
        Explore is a product preview using sample sessions. It does not read or
        write real projects yet.
      </p>
    </main>
  );
}
