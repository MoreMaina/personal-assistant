import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Fredoka, Nunito } from "next/font/google";

import "./globals.css";
import Navigation from "./components/Navigation";
import CloudSync from "./components/CloudSync";
import { ItemWorkTimerProvider } from "./components/ItemWorkTimer";

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
        <Suspense fallback={null}>
          <Navigation />
        </Suspense>

        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>

        <ItemWorkTimerProvider>
          <div className="app-frame">
            <header className="topbar">
              <Link
                href="/"
                className="topbar__brand"
                aria-label="Personal Assistant home"
              >
                <span className="topbar__brand-mark" aria-hidden="true">PA</span>
                <span>Personal Assistant</span>
              </Link>
            </header>

            <main className="app-content">
              <div className="page-shell">
                {children}
              </div>
            </main>
          </div>
        </ItemWorkTimerProvider>
      </body>
    </html>
  );
}
