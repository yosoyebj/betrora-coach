import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ToastProvider } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
});

export const metadata: Metadata = {
  title: "Betrora Coach Console",
  description:
    "Cinematic coaching console for Betrora coaches to guide clients with clarity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[radial-gradient(circle_at_top,_#0b0b10,_#02010a_55%)] text-slate-50`}
        suppressHydrationWarning
      >
        <ToastProvider>
          <ImpersonationBanner />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

