import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { Icon } from "@/components/icons";

function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark"><Icon name="bolt" size={16} /></span>
      <span>Match Day</span>
    </Link>
  );
}

function SignOut() {
  return (
    <form action="/api/logout" method="POST">
      <button type="submit" className="signout">Sign out</button>
    </form>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <a href="#main" className="skip">Skip to main content</a>

      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main" className="navlist">
          <Suspense fallback={null}><Nav label="Main navigation" /></Suspense>
        </nav>
        <div className="bottom"><SignOut /></div>
      </aside>

      <div>
        <header className="topbar">
          <Brand />
          <SignOut />
        </header>
        <main id="main" className="main">{children}</main>
      </div>

      <nav aria-label="Main (mobile)" className="bottomnav">
        <Suspense fallback={null}><Nav label="Mobile navigation" /></Suspense>
      </nav>
    </div>
  );
}
