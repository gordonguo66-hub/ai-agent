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
    <div className="min-h-[calc(100vh-4rem)] bg-[#030712] relative overflow-hidden">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-[#030712] to-blue-950/20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(30, 58, 138, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 58, 138, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>
      
      {/* Glowing Orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-800/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-20">
            <div className="inline-block mb-6 px-4 py-2 bg-blue-900/30 border border-blue-800 rounded-full">
              <span className="text-blue-300 text-sm font-medium">AI-Powered Trading Platform</span>
            </div>
            <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6 text-white">
              AI Arena Trade
            </h1>
            <p className="text-xl sm:text-2xl text-gray-300 max-w-3xl mx-auto mb-12 leading-relaxed">
              Trade with <span className="text-white font-semibold">AI strategies</span> using <span className="text-white font-semibold">real market data</span>.<br />
              Start virtual or go live. Compete in the arena.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={getStartedHref}>
                <Button size="lg" className="w-full sm:w-auto px-10 py-6 text-lg bg-blue-900 hover:bg-blue-800 text-white border border-blue-700 shadow-lg shadow-blue-900/50">
                  Get Started →
                </Button>
              </Link>
              <Link href="/arena">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-10 py-6 text-lg bg-transparent border-2 border-blue-700 text-white hover:text-white hover:border-blue-500 hover:bg-blue-900/50 transition-all">
                  View Arena
                </Button>
              </Link>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8">
            <Link href="/strategy/new">
              <Card className="h-full cursor-pointer border-blue-900/50 hover:border-blue-800 transition-all duration-300 group overflow-hidden !bg-[#0A0E1A]">
                <CardHeader className="!bg-[#0A0E1A] pb-6">
                  <div className="text-4xl mb-4">🎯</div>
                  <CardTitle className="text-2xl mb-2 text-white group-hover:text-gray-300 transition-colors">Create Strategies</CardTitle>
                  <CardDescription className="text-base text-gray-300">
                    Build AI-powered trading strategies with your own models and prompts
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/dashboard">
              <Card className="h-full cursor-pointer border-blue-900/50 hover:border-blue-800 transition-all duration-300 group overflow-hidden !bg-[#0A0E1A]">
                <CardHeader className="!bg-[#0A0E1A] pb-6">
                  <div className="text-4xl mb-4">📊</div>
                  <CardTitle className="text-2xl mb-2 text-white group-hover:text-gray-300 transition-colors">Virtual & Live Trading</CardTitle>
                  <CardDescription className="text-base text-gray-300">
                    Trade with real Hyperliquid market data. Start virtual ($100k) or go live with real orders.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/arena">
              <Card className="h-full cursor-pointer border-blue-900/50 hover:border-blue-800 transition-all duration-300 group overflow-hidden !bg-[#0A0E1A]">
                <CardHeader className="!bg-[#0A0E1A] pb-6">
                  <div className="text-4xl mb-4">🏆</div>
                  <CardTitle className="text-2xl mb-2 text-white group-hover:text-gray-300 transition-colors">Compete & Share</CardTitle>
                  <CardDescription className="text-base text-gray-300">
                    Join the arena leaderboard and engage with the community
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
