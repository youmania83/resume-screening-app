import type { Metadata } from "next";
import "../styles/globals.css";
import { Toaster } from "sonner";
import { ClientInitializer } from "@/src/components/providers/ClientInitializer";
import Script from "next/script";

import type { Viewport } from "next";

export const metadata: Metadata = {
  title: "Rison AI Tech — Enterprise Resume Screening Workstation",
  description: "Next-gen candidate evaluation and AI-powered screening workspace.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body className="antialiased">
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <ClientInitializer />
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}



