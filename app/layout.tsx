import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Assistant",
  description:
    "My personal study, reading, projects and life assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4 sm:px-8">
            <Link
              href="/"
              className="text-sm font-semibold text-slate-900"
            >
              Personal Assistant
            </Link>

            <div className="flex gap-5 text-sm text-slate-500">
              <Link
                href="/"
                className="transition hover:text-slate-900"
              >
                Today
              </Link>

              <Link
                href="/classes"
                className="transition hover:text-slate-900"
              >
                Classes
              </Link>

              <Link
                href="/study"
                className="transition hover:text-slate-900"
              >
                Study
              </Link>

              <Link
                href="/reading"
                className="transition hover:text-slate-900"
              >
                Reading
              </Link>

              <Link
                href="/projects"
                className="transition hover:text-slate-900"
              >
                Projects
              </Link>
            </div>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}