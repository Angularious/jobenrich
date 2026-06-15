import type { Metadata } from "next";
import { Anton, Space_Mono, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "JOB INTEL — who to talk to",
  description: "Paste a job posting. Get the people behind it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${anton.variable} ${spaceMono.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-base text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
