import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ErrorLogger } from "@/components/error-logger";
import { TimezoneProvider } from "@/components/timezone-provider";
import { Footer } from "@/components/footer";
import { LegalGate } from "@/components/legal-gate";
import { AuthGateProvider } from "@/components/auth-gate-provider";
import { AdminIdentifier } from "@/components/admin-identifier";
import { AnalyticsWrapper } from "@/components/analytics-wrapper";
import { PHProvider } from "./posthog-provider";
import { PostHogPageView } from "./posthog-pageview";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://coreboundai.io"),
  title: "Corebound",
  description: "AI executes. Human strategy sets the limits.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Corebound",
    description: "AI executes. Human strategy sets the limits.",
    type: "website",
    url: "https://coreboundai.io",
    siteName: "Corebound",
  },
  twitter: {
    card: "summary_large_image",
    title: "Corebound",
    description: "AI executes. Human strategy sets the limits.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} antialiased`}>
        <PHProvider>
          <Suspense fallback={null}>
            <PostHogPageView />
            <AdminIdentifier />
          </Suspense>
          <TimezoneProvider>
            <AuthGateProvider>
              <ErrorLogger />
              <LegalGate>
                <div className="min-h-screen flex flex-col">
                  <Nav />
                  <main className="flex-1">
                    {children}
                  </main>
                  <Footer />
                </div>
              </LegalGate>
            </AuthGateProvider>
          </TimezoneProvider>
          <AnalyticsWrapper />
        </PHProvider>
      </body>
    </html>
  );
}
