import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { LangProvider } from "./_client/i18n";
import { ServiceWorker } from "./_client/ServiceWorker";
import { SessionProvider } from "./_client/SessionProvider";

export const metadata: Metadata = {
  title: BRAND.title,
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: BRAND.name, title: BRAND.title, description: BRAND.description, locale: "sv_SE", alternateLocale: ["en_GB"], images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: BRAND.name }] },
  twitter: { card: "summary", title: BRAND.title, description: BRAND.description, images: ["/icons/icon-512.png"] },
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
