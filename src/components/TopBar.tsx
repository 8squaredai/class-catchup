import Link from "next/link";
import type { ReactNode } from "react";

/** Glass navigation bar with the ieNYC logo. */
export function TopBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Class Catch-up home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ienyc-logo-navy.png" alt="ieNYC" width={72} height={24} />
        <span className="divider" />
        <span className="app-name">{title}</span>
      </Link>
      <span className="spacer" />
      {children}
    </header>
  );
}
