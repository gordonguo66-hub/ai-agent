import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ErrorLogger } from "@/components/error-logger";
import { TimezoneProvider } from "@/components/timezone-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Arena Trade",
  description: "Trade with AI strategies using real market data. Virtual and live trading on Hyperliquid.",
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
          <ErrorLogger />
          <div className="min-h-screen flex flex-col">
            <Nav />
            <main className="flex-1">
              {children}
            </main>
          </div>
        </TimezoneProvider>
      </body>
    </html>
  );
}
