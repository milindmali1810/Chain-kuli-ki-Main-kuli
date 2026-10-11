"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const ITEMS = [
  { href: "/", label: "Matches", icon: "list" },
  { href: "/learning", label: "Learning", icon: "chart" },
  { href: "/data", label: "Data", icon: "database" },
  { href: "/guide", label: "Guide", icon: "help" },
] as const;

// The same four destinations on phone (bottom bar) and laptop (sidebar). The current page is announced with aria-current.
export function Nav({ label }: { label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/matches") : pathname.startsWith(href));
  return (
    <>
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="navlink" aria-current={isActive(item.href) ? "page" : undefined}>
          <Icon name={item.icon} size={22} />
          <span>{item.label}</span>
        </Link>
      ))}
      <span className="sr-only">{label}</span>
    </>
  );
}
