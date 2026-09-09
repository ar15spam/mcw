"use client";

import Link from "next/link";

export function StudioBoot({ label }: { label: string }) {
  return (
    <main className="studioShell studioBootShell">
      <div className="studioBootCard">
        <span className="markBars studioMarkBars" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
        <p>{label}</p>
      </div>
    </main>
  );
}

export function StudioError({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}) {
  return (
    <main className="studioShell studioBootShell">
      <div className="studioBootCard studioErrorCard">
        <h1>{title}</h1>
        <p>{detail}</p>
        {action &&
          ("href" in action ? (
            <Link className="studioNavButton studioNavPrimary" href={action.href}>
              {action.label}
            </Link>
          ) : (
            <button
              className="studioNavButton studioNavPrimary"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
      </div>
    </main>
  );
}

export default StudioBoot;
