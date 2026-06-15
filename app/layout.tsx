import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen bg-base text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
