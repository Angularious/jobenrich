import type { Metadata } from "next";
import { Anton, Noto_Sans_JP, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const noto = Noto_Sans_JP({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Intel ★ 求职情报",
  description: "Surface the people behind any LinkedIn job posting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${anton.variable} ${noto.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-market-bg font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
