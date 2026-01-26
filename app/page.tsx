"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser";

export default function Home() {
  const router = useRouter();
  const [getStartedHref, setGetStartedHref] = useState("/auth");

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setGetStartedHref("/dashboard");
        }
      } catch (error) {
        // If check fails, default to /auth
        setGetStartedHref("/auth");
      }
    };
    checkAuth();
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-20">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 text-foreground">
              AI Arena Trade
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Trade with AI strategies using real market data. Start virtual or go live. Compete in the arena.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={getStartedHref}>
                <Button size="lg" className="w-full sm:w-auto px-8">
                  Get Started
                </Button>
              </Link>
              <Link href="/arena">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  View Arena
                </Button>
              </Link>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-24">
            <Link href="/strategy/new">
              <Card className="h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl mb-2">Create Strategies</CardTitle>
                  <CardDescription className="text-base">
                    Build AI-powered trading strategies with your own models and prompts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Choose your model provider, configure risk filters, and write custom prompts.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard">
              <Card className="h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl mb-2">Virtual & Live Trading</CardTitle>
                  <CardDescription className="text-base">
                    Trade with real Hyperliquid market data. Start virtual ($100k) or go live with real orders.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Monitor sessions, track decisions, view equity curves, and analyze performance in real-time.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/arena">
              <Card className="h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl mb-2">Compete & Share</CardTitle>
                  <CardDescription className="text-base">
                    Join the arena leaderboard and engage with the community
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Opt-in to rankings, share insights, and learn from others.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
