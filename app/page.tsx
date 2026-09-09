import Link from "next/link";
import LandingStudioPreview from "@/components/marketing/LandingStudioPreview";

const features = [
  {
    index: "01",
    kicker: "REALTIME",
    title: "One room. One session.",
    copy: "Write drums, move clips, change tempo and shape the same project together — without sending versions back and forth.",
  },
  {
    index: "02",
    kicker: "BROWSER NATIVE",
    title: "Open the link. Start making.",
    copy: "No heavyweight install between the idea and the session. Your collaborator can join from a browser and hear the project immediately.",
  },
  {
    index: "03",
    kicker: "MUSICAL STATE",
    title: "Everyone sees the same song.",
    copy: "Transport, arrangement, MIDI patterns, mixer state and instruments move together as one shared project.",
  },
];

const sessionRows = [
  { name: "AARON", action: "added clap / bar 05", time: "NOW" },
  { name: "MAYA", action: "moved synth clip → bar 03", time: "04S" },
  { name: "KAI", action: "changed cutoff / deep bass", time: "11S" },
  { name: "AARON", action: "tempo 124 → 128", time: "18S" },
];

export default function LandingPage() {
  return (
    <main className="marketingPage">
      <nav className="marketingNav">
        <Link className="wordmark" href="/" aria-label="Midicollab home">
          <span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          MIDICOLLAB
        </Link>

        <div className="marketingNavLinks">
          <a href="#product">PRODUCT</a>
          <a href="#workflow">WORKFLOW</a>
          <a href="#about">ABOUT</a>
        </div>

        <div className="marketingNavActions">
          <Link className="navLogin" href="/login">SIGN IN</Link>
          <Link className="navCta" href="/signup">START A SESSION <span>↗</span></Link>
        </div>
      </nav>

      <section className="heroSection">
        <div className="heroRail">
          <span>COLLABORATIVE MUSIC SOFTWARE</span>
          <span>WEB / MIDI / AUDIO</span>
          <span className="heroLive"><i /> SYSTEM ONLINE</span>
        </div>

        <div className="heroCopy">
          <p className="heroEyebrow">MAKE TOGETHER / 001</p>
          <h1>
            MAKE MUSIC<br />
            <span>WITH ANYONE.</span><br />
            ANYWHERE.
          </h1>
          <div className="heroLower">
            <p>
              A multiplayer music studio for ideas that should not have to wait for exports,
              uploads, stems or “final_v7_REAL.wav”.
            </p>
            <div className="heroButtons">
              <Link className="bigPrimary" href="/signup">START CREATING <span>↗</span></Link>
              <Link className="bigGhost" href="/signup">CREATE FREE ACCOUNT</Link>
            </div>
          </div>
        </div>

        <div className="heroPreviewWrap" id="product">
          <div className="previewLabel"><span>LIVE PRODUCT / CLICKABLE</span><b>01:42:08</b></div>
          <LandingStudioPreview />
        </div>

        <div className="heroStats">
          <div><small>SHARED STATE</small><strong>REALTIME</strong></div>
          <div><small>INSTRUMENTS</small><strong>DRUMS / SYNTH / SAMPLER</strong></div>
          <div><small>PROJECT LENGTH</small><strong>4 — 32 BARS</strong></div>
          <div><small>COLLABORATORS</small><strong>LIVE PRESENCE</strong></div>
        </div>
      </section>

      <section className="manifestoSection" id="workflow">
        <div className="sectionIndex">02 / WHY</div>
        <div className="manifestoCopy">
          <p>THE OLD WORKFLOW</p>
          <h2>
            STOP PASSING<br />
            <span>THE AUX FILE.</span>
          </h2>
        </div>
        <div className="workflowComparison">
          <div className="workflowBad">
            <div className="workflowTitle"><span>BEFORE</span><small>12:48 AM</small></div>
            <div className="filePile">
              <span>beat_final.wav</span>
              <span>beat_final2.wav</span>
              <span>beat_maya_edit.wav</span>
              <span>beat_FINAL_REAL.wav</span>
              <span>beat_final_REAL_2.wav</span>
            </div>
            <p>Exports, uploads, stale versions, “which one are you on?”</p>
          </div>
          <div className="workflowArrow">→</div>
          <div className="workflowGood">
            <div className="workflowTitle"><span>MIDICOLLAB</span><small>LIVE</small></div>
            <div className="roomCard">
              <div><i /> HOUSE_001</div>
              <strong>3 PEOPLE<br />1 PROJECT</strong>
              <span>JOIN ROOM ↗</span>
            </div>
            <p>One project state. Everyone edits what is actually playing.</p>
          </div>
        </div>
      </section>

      <section className="featuresSection">
        <div className="sectionIndex">03 / PRODUCT</div>
        <div className="featureLead">
          <p>BUILT AROUND THE SESSION</p>
          <h2>EVERYTHING<br />MOVES TOGETHER.</h2>
        </div>
        <div className="featureRows">
          {features.map((feature) => (
            <article className="featureRow" key={feature.index}>
              <span className="featureIndex">{feature.index}</span>
              <p className="featureKicker">{feature.kicker}</p>
              <h3>{feature.title}</h3>
              <p className="featureCopy">{feature.copy}</p>
              <span className="featureArrow">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="presenceSection">
        <div className="presenceIntro">
          <div className="sectionIndex">04 / PRESENCE</div>
          <p>NOT JUST A CHAT ROOM</p>
          <h2>SEE THE<br /><span>SESSION HAPPEN.</span></h2>
          <p className="presenceCopy">
            Every useful action becomes part of the shared musical context — who changed what,
            what is playing, and where the idea is going.
          </p>
        </div>
        <div className="activityBoard">
          <div className="activityHeader">
            <span>SESSION_ACTIVITY</span>
            <span><i /> 3 ONLINE</span>
          </div>
          {sessionRows.map((row, index) => (
            <div className="activityRow" key={`${row.name}-${index}`}>
              <span className="activityAvatar">{row.name[0]}</span>
              <strong>{row.name}</strong>
              <p>{row.action}</p>
              <small>{row.time}</small>
            </div>
          ))}
          <div className="activityMeters">
            {Array.from({ length: 42 }, (_, index) => (
              <i key={index} style={{ height: `${18 + ((index * 17) % 64)}%` }} />
            ))}
          </div>
        </div>
      </section>

      <section className="principlesSection" id="about">
        <div className="sectionIndex">05 / PRINCIPLES</div>
        <div className="principlesHeader">
          <p>MADE FOR MUSICIANS WHO MOVE FAST</p>
          <h2>LESS SETUP.<br />MORE SIGNAL.</h2>
        </div>
        <div className="principleGrid">
          <div><span>01</span><h3>LINK FIRST</h3><p>A session should be as easy to join as a call.</p></div>
          <div><span>02</span><h3>MUSIC FIRST</h3><p>Collaboration lives inside the transport, arrangement and instrument state.</p></div>
          <div><span>03</span><h3>NO GENERIC SAAS</h3><p>The interface should feel like a tool producers actually want open.</p></div>
          <div><span>04</span><h3>OWN THE PROJECT</h3><p>Accounts and project metadata are durable. The music stays the center of the product.</p></div>
        </div>
      </section>

      <section className="finalCtaSection">
        <div className="ctaNoise" aria-hidden="true" />
        <div className="finalCtaMeta"><span>READY / 006</span><span>MIDICOLLAB © 2026</span></div>
        <h2>MAKE THE<br />NEXT ONE<br /><span>TOGETHER.</span></h2>
        <div className="finalCtaActions">
          <Link className="bigPrimary light" href="/signup">CREATE YOUR ACCOUNT <span>↗</span></Link>
          <Link href="/login">OR SIGN IN →</Link>
        </div>
      </section>

      <footer className="marketingFooter">
        <Link className="wordmark" href="/"><span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>MIDICOLLAB</Link>
        <div><a href="#product">PRODUCT</a><a href="#workflow">WORKFLOW</a><Link href="/login">SIGN IN</Link></div>
        <p>COLLABORATIVE MUSIC SOFTWARE<br />BUILT IN CALIFORNIA / ONLINE EVERYWHERE</p>
      </footer>
    </main>
  );
}
