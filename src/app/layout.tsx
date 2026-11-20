import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "./_client/i18n";
import { ServiceWorker } from "./_client/ServiceWorker";
import { SessionProvider } from "./_client/SessionProvider";

export const metadata: Metadata = {
  title: "Tiptoe – Wild Encounters",
  description: "Smyg dig nära vilda djur och fotografera dem. Bygg reservat genom att gå slutna slingor.",
  applicationName: "Tiptoe",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Tiptoe", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f231c",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <LangProvider>
          <SessionProvider>
            {children}
            <ServiceWorker />
          </SessionProvider>
        </LangProvider>
      </body>
    </html>
  );
}
