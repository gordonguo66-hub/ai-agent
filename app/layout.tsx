import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ErrorLogger } from "@/components/error-logger";
import { TimezoneProvider } from "@/components/timezone-provider";
import { Footer } from "@/components/footer";
import { LegalGate } from "@/components/legal-gate";
import { AuthGateProvider } from "@/components/auth-gate-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Corebound",
  description: "AI executes. Human strategy sets the limits.",
  openGraph: {
    title: "Corebound",
    description: "AI executes. Human strategy sets the limits.",
    type: "website",
    images: ["/brand/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Corebound",
    description: "AI executes. Human strategy sets the limits.",
    images: ["/brand/og-image.png"],
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
        <Analytics />
      </body>
    </html>
  );
}
