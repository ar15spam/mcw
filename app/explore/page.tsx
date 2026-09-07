"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const genres = ["All rooms", "House", "Techno", "R&B", "Hip-Hop", "Ambient", "Garage", "DnB"];
const sessions = [
  { title: "Night drive sketches", creator: "mara.wav", genre: "House", bpm: 124, bars: 16, live: true, color: "blue", id: "night-drive" },
  { title: "Soft focus / 02", creator: "juniper", genre: "Ambient", bpm: 96, bars: 8, live: false, color: "lime", id: "soft-focus" },
  { title: "Concrete gardens", creator: "kaito", genre: "Techno", bpm: 132, bars: 32, live: true, color: "orange", id: "concrete-gardens" },
  { title: "Afterimage", creator: "sol.8", genre: "R&B", bpm: 88, bars: 8, live: false, color: "violet", id: "afterimage" },
  { title: "Late checkout", creator: "milo", genre: "Garage", bpm: 138, bars: 16, live: false, color: "cyan", id: "late-checkout" },
  { title: "Dust on the lens", creator: "northstar", genre: "Hip-Hop", bpm: 92, bars: 12, live: false, color: "red", id: "dust-lens" },
];

function Pattern({ color, compact = false }: { color: string; compact?: boolean }) {
  return <div className={`explorePattern ${color} ${compact ? "compact" : ""}`} aria-hidden="true">{Array.from({ length: compact ? 18 : 36 }, (_, i) => <i key={i} className={(i * 7 + color.length) % 9 < 3 ? "on" : ""} />)}</div>;
}

export default function ExplorePage() {
  const [genre, setGenre] = useState("All rooms");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => sessions.filter((session) => (genre === "All rooms" || session.genre === genre) && `${session.title} ${session.creator}`.toLowerCase().includes(query.toLowerCase())), [genre, query]);
  return (
    <main className="explorePage">
      <nav className="dashNav exploreNav">
        <Link className="wordmark" href="/dashboard"><span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>MIDICOLLAB</Link>
        <div className="exploreNavLinks"><Link href="/dashboard">Projects</Link><span className="active">Explore</span></div>
        <Link className="exploreProfile" href="/dashboard">Workspace <span>↗</span></Link>
      </nav>
      <div className="exploreFrame">
        <header className="exploreHeader">
          <div><span className="dashboardKicker">Community sessions · preview</span><h1>Explore</h1><p>Find a room, follow a thread, and make something with someone new.</p></div>
          <label className="exploreSearch"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions or creators" aria-label="Search sessions or creators" /></label>
        </header>
        <div className="genreRail">{genres.map((item) => <button key={item} className={genre === item ? "selected" : ""} onClick={() => setGenre(item)}>{item}</button>)}</div>
        <section className="exploreLead"><div className="sectionLabel"><span>01</span><h2>Featured sessions</h2><span className="sectionRule" /></div><div className="featuredGrid">{sessions.slice(0, 3).map((session) => <Link href={`/p/${session.id}`} className={`featuredSession ${session.color}`} key={session.id}><Pattern color={session.color} /><div className="featuredInfo"><div><span className="liveLabel">{session.live ? "● Live now" : "Shared session"}</span><h3>{session.title}</h3><p>{session.creator} · {session.genre}</p></div><span className="sessionArrow">↗</span></div><div className="sessionStats"><span>{session.bpm} BPM</span><span>{session.bars} bars</span><span>{session.live ? "3 collaborators" : "Updated today"}</span></div></Link>)}</div></section>
        <section className="exploreSection"><div className="sectionLabel"><span>02</span><h2>New from the community</h2><span className="sectionRule" /><span className="sectionCount">{filtered.length} sessions</span></div><div className="communityGrid">{filtered.map((session, index) => <Link href={`/p/${session.id}`} className="communityCard" key={session.id}><div className="communityVisual"><Pattern color={session.color} compact /><span className="cardIndex">{String(index + 1).padStart(2, "0")}</span><span className="playMark">▶</span></div><div className="communityCopy"><div><h3>{session.title}</h3><p>{session.creator}</p></div><span className="communityMeta">{session.genre}<br />{session.bpm} BPM</span></div></Link>)}</div></section>
        <section className="exploreBottom"><div className="sectionLabel"><span>03</span><h2>Live rooms</h2><span className="sectionRule" /></div><div className="liveRooms"><div><span className="livePulse" /><strong>Concrete gardens</strong><span>kaito + 2 others</span><b>132 BPM</b><Link href="/studio?project=concrete-gardens">Join room →</Link></div><div><span className="livePulse" /><strong>Night drive sketches</strong><span>mara.wav + 1 other</span><b>124 BPM</b><Link href="/studio?project=night-drive">Join room →</Link></div></div></section>
        <p className="exploreDisclaimer">Explore is a product preview using sample community sessions. Public discovery APIs can plug into these components when ready.</p>
      </div>
    </main>
  );
}
