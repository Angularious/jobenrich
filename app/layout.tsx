import type { Metadata } from "next";
import { Shippori_Mincho, Inter } from "next/font/google";
import "./globals.css";

const mincho = Shippori_Mincho({
  variable: "--font-mincho",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Intel",
  description: "Surface people related to any LinkedIn job posting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mincho.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-paper font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
