import Link from "next/link";
import AuthForm from "@/components/auth/AuthForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="authPage">
      <section className="authPanel">
        <Link className="wordmark authWordmark" href="/">
          <span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          MIDICOLLAB
        </Link>
        <AuthForm mode="signup" next={next} />
        <div className="authLegal">BY CONTINUING, YOU AGREE TO THE TERMS / PRIVACY</div>
      </section>

      <section className="authVisual" aria-hidden="true">
        <div className="authVisualMeta"><span>LIVE SESSION / 128 BPM</span><span>03 ONLINE</span></div>
        <h2>YOUR NEXT<br />SESSION<br /><span>STARTS HERE.</span></h2>
        <div className="authWaveform">
          {Array.from({ length: 62 }, (_, index) => (
            <i key={index} style={{ height: `${12 + ((index * 29) % 84)}%` }} />
          ))}
        </div>
        <div className="authRoomMock">
          <div><span>A</span><b>AARON</b><small>DRUMS</small></div>
          <div><span>M</span><b>MAYA</b><small>SYNTH</small></div>
          <div><span>K</span><b>KAI</b><small>SAMPLER</small></div>
        </div>
        <div className="authVisualFoot"><span>HOUSE_001</span><span>REV 042</span><span>12MS</span></div>
      </section>
    </main>
  );
}
