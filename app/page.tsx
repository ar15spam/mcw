import Link from "next/link";
import CoproducerDemo from "@/components/marketing/CoproducerDemo";
import LandingStudioPreview from "@/components/marketing/LandingStudioPreview";

const steps = [
  {
    n: "01",
    title: "Start with a feeling",
    copy: "Pick a vibe or describe what you want — “something dark and futuristic”. MIDICOLLAB builds a beat, bass and sound to match.",
  },
  {
    n: "02",
    title: "Shape it in plain words",
    copy: "“Make the drums bounce.” “More electric.” “Less busy.” The co-producer changes the actual project — not a chat transcript.",
  },
  {
    n: "03",
    title: "Make it together, live",
    copy: "Share a link. Anyone who joins edits the same session in real time — you both hear every change as it happens.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="landingAtmos" aria-hidden="true" />

      <nav className="landingNav">
        <Link className="wordmark" href="/" aria-label="MIDICOLLAB home">
          <span className="markBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          MIDICOLLAB
        </Link>
        <div className="landingNavLinks">
          <a href="#how">How it works</a>
          <a href="#together">Collaborate</a>
        </div>
        <div className="landingNavActions">
          <Link className="landingNavLogin" href="/login">
            Sign in
          </Link>
          <Link className="landingNavCta" href="/signup">
            Start free
          </Link>
        </div>
      </nav>

      <section className="landingHero">
        <p className="landingEyebrow">COLLABORATIVE MUSIC STUDIO · IN YOUR BROWSER</p>
        <h1>
          Make music
          <br />
          <span>with anyone.</span>
        </h1>
        <p className="landingLede">
          You don&apos;t need to know how to produce. Tell MIDICOLLAB how you want
          it to feel — and make it together, in real time.
        </p>
        <div className="landingHeroActions">
          <Link className="landingPrimary" href="/signup">
            Start a session <span>↗</span>
          </Link>
          <a className="landingGhost" href="#how">
            See how it works
          </a>
        </div>

        <div className="landingDemoWrap">
          <CoproducerDemo />
        </div>
      </section>

      <section className="landingSection" id="how">
        <div className="landingSectionHead">
          <span className="landingIndex">02 / HOW IT WORKS</span>
          <h2>
            From idea to sound
            <br />
            in one sentence.
          </h2>
        </div>
        <div className="landingSteps">
          {steps.map((step) => (
            <article key={step.n}>
              <span className="landingStepN">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingSection landingProduct" id="product">
        <div className="landingSectionHead">
          <span className="landingIndex">03 / THE STUDIO</span>
          <h2>A real studio, not a toy.</h2>
          <p className="landingSectionCopy">
            Drums, bass, synths, a piano roll, a mixer, sample upload, WAV export.
            Beginners drive it with words; producers reach straight for the grid.
          </p>
        </div>
        <div className="landingPreviewFrame">
          <LandingStudioPreview />
        </div>
      </section>

      <section className="landingSection landingTogether" id="together">
        <div className="landingSectionHead">
          <span className="landingIndex">04 / TOGETHER</span>
          <h2>
            Stop passing
            <br />
            <span>the aux file.</span>
          </h2>
          <p className="landingSectionCopy">
            No exports, no “final_v3_REAL.wav”. One project, one link. Everyone
            edits what&apos;s actually playing and sees each other move.
          </p>
        </div>
        <div className="landingTogetherCard">
          <div className="landingRoom">
            <span className="landingRoomLive">
              <i /> LIVE
            </span>
            <strong>3 people · 1 project</strong>
            <div className="landingRoomFaces">
              <span>AR</span>
              <span>JD</span>
              <span>MK</span>
            </div>
          </div>
          <ul className="landingActivity">
            <li>
              <b>Aaron</b> added a clap on bar 5
            </li>
            <li>
              <b>Maya</b> — “make the synth dreamier”
            </li>
            <li>
              <b>Kai</b> moved the lead to bar 3
            </li>
          </ul>
        </div>
      </section>

      <section className="landingFinal">
        <div className="landingFinalMeta">
          <span>READY</span>
          <span>MIDICOLLAB © 2026</span>
        </div>
        <h2>
          Make the next one
          <br />
          <span>together.</span>
        </h2>
        <Link className="landingPrimary landingPrimaryLg" href="/signup">
          Create your account <span>↗</span>
        </Link>
      </section>

      <footer className="landingFooter">
        <Link className="wordmark" href="/">
          <span className="markBars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          MIDICOLLAB
        </Link>
        <div>
          <a href="#how">How it works</a>
          <a href="#together">Collaborate</a>
          <Link href="/login">Sign in</Link>
        </div>
        <p>Collaborative music software · built on the web</p>
      </footer>
    </main>
  );
}
