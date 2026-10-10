import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";

import "./globals.css";
import Navigation from "./components/Navigation";
import SignOutButton from "./components/SignOutButton";
import CloudSync from "./components/CloudSync";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Personal Assistant",
  description:
    "My personal study, reading, projects and life assistant",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#23412F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fredoka.variable} ${nunito.variable}`}
      >
        <Navigation />

        <CloudSync />

        <div className="app-frame">
          <header className="topbar">
            <div className="topbar__brand">
              Personal Assistant
            </div>

            <div className="topbar__actions">
              <SignOutButton />
            </div>
          </header>

          <main className="app-content">
            <div className="page-shell">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}