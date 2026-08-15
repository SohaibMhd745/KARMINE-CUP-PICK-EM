"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import LoginButton from "@/components/LoginButton";
import type { Profile } from "@/lib/types";

const LINKS = [
  { href: "/", label: "ACCUEIL" },
  { href: "/pronostics", label: "PRONOSTICS" },
  { href: "/finale", label: "FINALE" },
  { href: "/groupes", label: "GROUPES" },
  { href: "/classement", label: "CLASSEMENT" },
  { href: "/streams", label: "STREAMS" },
  { href: "/reglement", label: "RÈGLEMENT" },
];

export default function Nav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="header">
      <nav className="nav">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          ✦ KARMINE CUP
        </Link>

        <button
          type="button"
          className="burger"
          aria-expanded={open}
          aria-controls="navlinks"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sronly">Menu</span>
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>

        <div id="navlinks" className={`navlinks${open ? " open" : ""}`}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="navlink"
              aria-current={isCurrent(link.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          {profile?.is_admin && (
            <Link
              href="/admin"
              className="navlink admin"
              aria-current={isCurrent("/admin") ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              ADMIN
            </Link>
          )}
        </div>

        <div className="fill" />

        <LoginButton profile={profile} />
      </nav>
    </header>
  );
}
