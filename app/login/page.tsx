import Link from "next/link";
import AuthForm from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <main className="authPage loginVariant">
      <section className="authPanel">
        <Link className="wordmark authWordmark" href="/">
          <span className="markBars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          MIDICOLLAB
        </Link>
        <AuthForm mode="login" />
        <div className="authLegal">SECURE SESSION / COOKIE AUTH / POSTGRES</div>
      </section>

      <section className="authVisual" aria-hidden="true">
        <div className="authVisualMeta"><span>RECENT / HOUSE_001</span><span>UPDATED 2M AGO</span></div>
        <h2>KEEP THE<br />IDEA<br /><span>IN MOTION.</span></h2>
        <div className="loginTimeline">
          <div><b>01</b><i className="wide" /><i /><i className="short" /></div>
          <div><b>02</b><i /><i className="wide accent" /></div>
          <div><b>03</b><i className="short" /><i className="wide" /><i /></div>
          <div><b>04</b><i className="wide accent2" /></div>
        </div>
        <div className="authVisualFoot"><span>4 TRACKS</span><span>8 BARS</span><span>128 BPM</span></div>
      </section>
    </main>
  );
}
