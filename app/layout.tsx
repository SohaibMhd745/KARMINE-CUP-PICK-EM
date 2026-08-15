import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";

import Nav from "@/components/Nav";
import { getProfile } from "@/lib/supabase/server";

import "./globals.css";

const serif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Karmine Cup — Pick'em",
  description:
    "Pronostique les matchs de la Karmine Cup, grimpe au classement et tente de gagner des lots.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <html lang="fr" className={`${serif.variable} ${inter.variable}`}>
      <body>
        <Nav profile={profile} />
        <main className="wrap">{children}</main>
        <footer className="footer">KARMINE CUP · Pick&apos;em</footer>
      </body>
    </html>
  );
}
