"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Lock, WalletMinimal, Power, ListChecks, Brain, ShieldCheck, Cpu, GitBranch, Settings } from "lucide-react";
import { useAuthGate } from "@/components/auth-gate-provider";

export default function Home() {
  const { user, gatedNavigate } = useAuthGate();

  const handleBuildStrategy = (e: React.MouseEvent) => {
    e.preventDefault();
    gatedNavigate("/dashboard", {
      title: "Sign in to build strategies",
      description: "Create an account or sign in to start building your AI trading strategies.",
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] relative overflow-hidden">
      {/* Animated Background Grid with Fade */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-[#070d1a] to-blue-950/20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(30, 58, 138, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 58, 138, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 90%)'
        }}></div>
      </div>
      
      {/* Glowing Orbs */}
      <div
        className="absolute top-10 left-5 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] lg:w-[700px] lg:h-[700px] bg-blue-900/40 rounded-full blur-3xl"
        style={{
          animation: 'slowPulse 4s ease-in-out infinite, randomFloat1 35s ease-in-out infinite'
        }}
      ></div>
      <div
        className="absolute top-1/3 right-10 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] lg:w-[600px] lg:h-[600px] bg-blue-800/30 rounded-full blur-3xl"
        style={{
          animation: 'slowPulse 5s ease-in-out infinite 1s, randomFloat2 40s ease-in-out infinite'
        }}
      ></div>
      <div
        className="absolute top-2/3 left-10 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] lg:w-[600px] lg:h-[600px] bg-blue-900/30 rounded-full blur-3xl"
        style={{
          animation: 'slowPulse 4.5s ease-in-out infinite 3s, randomFloat1 45s ease-in-out infinite 10s'
        }}
      ></div>
      <div
        className="absolute bottom-10 right-5 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] lg:w-[700px] lg:h-[700px] bg-blue-800/40 rounded-full blur-3xl"
        style={{
          animation: 'slowPulse 4s ease-in-out infinite 2s, randomFloat2 40s ease-in-out infinite'
        }}
      ></div>
      
      <style jsx>{`
        @keyframes slowPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.55; }
        }
        @keyframes randomFloat1 {
          0% { transform: translate(0, 0); }
          12% { transform: translate(-120px, 80px); }
          25% { transform: translate(150px, -60px); }
          37% { transform: translate(-80px, -100px); }
          50% { transform: translate(130px, 120px); }
          62% { transform: translate(-140px, -50px); }
          75% { transform: translate(90px, -110px); }
          87% { transform: translate(-60px, 70px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes randomFloat2 {
          0% { transform: translate(0, 0); }
          11% { transform: translate(100px, -110px); }
          23% { transform: translate(-120px, 70px); }
          34% { transform: translate(140px, 90px); }
          45% { transform: translate(-90px, -120px); }
          56% { transform: translate(110px, 60px); }
          67% { transform: translate(-130px, -80px); }
          78% { transform: translate(80px, 110px); }
          89% { transform: translate(-100px, -70px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20">
        <div className="max-w-5xl mx-auto space-y-32">
          
          {/* Hero Section */}
          <div className="text-center space-y-12 pt-20">
            {/* Headline with decorative lines */}
            <div className="flex justify-center w-full">
              <div className="relative inline-block max-w-full">
                {/* Decorative vertical lines - hidden on mobile */}
                <div className="hidden sm:block absolute -left-16 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent"></div>
                <div className="hidden sm:block absolute -right-16 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent"></div>

                <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-light text-white leading-tight px-4 text-center">
                  AI executes. You set the boundaries.
                </h1>
              </div>
            </div>
            
            {/* Subheadline (outside brackets) */}
            <p className="text-lg sm:text-xl text-gray-300 leading-relaxed max-w-4xl mx-auto">
              Design rule-based strategies, define risk constraints, and let AI execute <br className="hidden sm:block" />
              within them.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center pt-4">
              <Button 
                size="lg" 
                onClick={handleBuildStrategy}
                className="w-full sm:w-auto px-16 py-7 text-xl bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-[0_0_40px_rgba(37,99,235,0.5)] hover:shadow-[0_0_50px_rgba(37,99,235,0.6)] transition-all hover:scale-105"
              >
                Build a Strategy
              </Button>
              <Link href="/arena">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-16 py-7 text-xl bg-transparent border-2 border-gray-700 text-white hover:text-white hover:border-gray-600 hover:bg-gray-800/20 rounded-2xl transition-all">
                  View Arena
                </Button>
              </Link>
            </div>
          </div>

          {/* Platform Definition */}
          <div className="max-w-7xl mx-auto text-center px-4">
            <p className="text-base sm:text-lg text-gray-400 leading-relaxed">
              Corebound is a model-agnostic AI trading platform where execution is automated and risk is human-defined.
            </p>
          </div>

          {/* Divider */}
          <div className="relative py-12">
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
          </div>

          {/* AI Engine Section */}
          <div className="text-center max-w-4xl mx-auto space-y-10">
            <div className="inline-flex items-center gap-4 mb-10 p-4 rounded-xl bg-gradient-to-r from-blue-950/20 via-blue-900/10 to-blue-950/20 border border-blue-500/20">
              <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-500/30">
                <Cpu className="w-7 h-7 text-blue-400" />
              </div>
              <div className="w-8 h-px bg-gradient-to-r from-blue-500/50 to-blue-500/20"></div>
              <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-500/30">
                <GitBranch className="w-7 h-7 text-blue-400" />
              </div>
              <div className="w-8 h-px bg-gradient-to-r from-blue-500/20 to-blue-500/50"></div>
              <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-500/30">
                <Settings className="w-7 h-7 text-blue-400" />
              </div>
            </div>
            
            <h2 className="text-4xl sm:text-5xl font-light text-white">Choose your AI engine</h2>
            
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Different AI models reason differently. You choose which model runs your strategy — and can change it at any time.
            </p>
          </div>

          {/* Trust & Safety */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="group p-8 rounded-xl bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-500/20 hover:border-blue-500/40 transition-all hover:shadow-lg hover:shadow-blue-500/10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-950/50 border border-blue-500/30 mb-5 group-hover:bg-blue-900/30 transition-all group-hover:scale-110">
                <FileText className="w-7 h-7 text-blue-400" />
              </div>
              <p className="text-base text-gray-300 font-light">Paper trading first</p>
            </div>
            <div className="group p-8 rounded-xl bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-500/20 hover:border-blue-500/40 transition-all hover:shadow-lg hover:shadow-blue-500/10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-950/50 border border-blue-500/30 mb-5 group-hover:bg-blue-900/30 transition-all group-hover:scale-110">
                <Lock className="w-7 h-7 text-blue-400" />
              </div>
              <p className="text-base text-gray-300 font-light">Encrypted API keys</p>
            </div>
            <div className="group p-8 rounded-xl bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-500/20 hover:border-blue-500/40 transition-all hover:shadow-lg hover:shadow-blue-500/10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-950/50 border border-blue-500/30 mb-5 group-hover:bg-blue-900/30 transition-all group-hover:scale-110">
                <WalletMinimal className="w-7 h-7 text-blue-400" />
              </div>
              <p className="text-base text-gray-300 font-light">No fund custody</p>
            </div>
            <div className="group p-8 rounded-xl bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-500/20 hover:border-blue-500/40 transition-all hover:shadow-lg hover:shadow-blue-500/10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-950/50 border border-blue-500/30 mb-5 group-hover:bg-blue-900/30 transition-all group-hover:scale-110">
                <Power className="w-7 h-7 text-blue-400" />
              </div>
              <p className="text-base text-gray-300 font-light">Kill switch anytime</p>
            </div>
          </div>

          {/* Divider */}
          <div className="relative py-12">
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
          </div>

          {/* What You Can Build */}
          <div className="text-center space-y-16">
            <h2 className="text-4xl sm:text-5xl font-light text-white">What you can build</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="group relative p-10 rounded-2xl bg-gradient-to-br from-blue-950/30 via-blue-900/10 to-transparent border border-blue-500/30 hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-blue-500/20">
                <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-all"></div>
                <div className="relative flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/30">
                    <ListChecks className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xl text-gray-200">Rule-based strategies</p>
                </div>
              </div>
              
              <div className="group relative p-10 rounded-2xl bg-gradient-to-br from-blue-950/30 via-blue-900/10 to-transparent border border-blue-500/30 hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-blue-500/20">
                <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-all"></div>
                <div className="relative flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/30">
                    <Brain className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xl text-gray-200">AI-driven execution</p>
                </div>
              </div>
              
              <div className="group relative p-10 rounded-2xl bg-gradient-to-br from-blue-950/30 via-blue-900/10 to-transparent border border-blue-500/30 hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-blue-500/20">
                <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-all"></div>
                <div className="relative flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/30">
                    <ShieldCheck className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xl text-gray-200">Risk-bounded automation</p>
                </div>
              </div>
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center py-20">
            <p className="text-3xl text-gray-100 font-light mb-16">
              Start in simulation. Go live when ready.
            </p>
            <Button 
              size="lg" 
              onClick={handleBuildStrategy}
              className="px-10 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-500/30 hover:shadow-blue-500/60 transition-all hover:scale-105"
            >
              Build a Strategy
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
