import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@curasphere/design-system/system.css";
import "./globals.css";
import "./premium.css";
import "./workspace.css";
import "./interface.css";
import "./page-workspaces.css";
import "./landing-motion.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: "400",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CuraSphere",
  description: "Clinician workspace. Source records stay authoritative. Derived briefings cite those records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={sans.className}>
        <a className="skip" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
