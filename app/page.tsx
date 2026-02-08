"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Coins, Lock, WalletMinimal, Power, ListChecks, Brain, ShieldCheck, Cpu, GitBranch, Settings, Clock } from "lucide-react";
import { useAuthGate } from "@/components/auth-gate-provider";
import { useEffect, useRef, useState } from "react";

// Crypto logo SVG components
const CryptoLogos = {
  bitcoin: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#F7931A" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M22.5 14.1c.3-2.1-1.3-3.2-3.4-4l.7-2.8-1.7-.4-.7 2.7c-.4-.1-.9-.2-1.4-.3l.7-2.7-1.7-.4-.7 2.8c-.4-.1-.7-.2-1.1-.3l-2.3-.6-.5 1.8s1.3.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .2.1h-.2l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 2 2.2.5c.4.1.8.2 1.2.3l-.7 2.9 1.7.4.7-2.8c.5.1.9.2 1.4.3l-.7 2.8 1.7.4.7-2.9c3 .6 5.2.3 6.1-2.4.8-2.1 0-3.4-1.6-4.2 1.1-.3 2-1 2.2-2.5zm-4 5.5c-.5 2.1-4.2 1-5.4.7l1-3.9c1.2.3 5 .9 4.4 3.2zm.6-5.6c-.5 1.9-3.5 1-4.5.7l.9-3.5c1 .2 4.1.7 3.6 2.8z"/>
    </svg>
  ),
  ethereum: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#627EEA" cx="16" cy="16" r="16"/>
      <path fill="#fff" fillOpacity=".6" d="M16.5 4v8.9l7.5 3.3z"/>
      <path fill="#fff" d="M16.5 4L9 16.2l7.5-3.3z"/>
      <path fill="#fff" fillOpacity=".6" d="M16.5 21.9v6.1l7.5-10.4z"/>
      <path fill="#fff" d="M16.5 28v-6.1L9 17.6z"/>
      <path fill="#fff" fillOpacity=".2" d="M16.5 20.6l7.5-4.4-7.5-3.3z"/>
      <path fill="#fff" fillOpacity=".6" d="M9 16.2l7.5 4.4v-7.7z"/>
    </svg>
  ),
  solana: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <defs>
        <linearGradient id="solGradFloat" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3"/>
          <stop offset="100%" stopColor="#DC1FFF"/>
        </linearGradient>
      </defs>
      <circle fill="url(#solGradFloat)" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M9.5 19.8c.2-.2.4-.3.7-.3h12.6c.4 0 .7.5.4.9l-2.4 2.4c-.2.2-.4.3-.7.3H7.5c-.4 0-.7-.5-.4-.9l2.4-2.4zm0-7.6c.2-.2.4-.3.7-.3h12.6c.4 0 .7.5.4.9l-2.4 2.4c-.2.2-.4.3-.7.3H7.5c-.4 0-.7-.5-.4-.9l2.4-2.4zm13.3 3.8c-.2-.2-.4-.3-.7-.3H9.5c-.4 0-.7.5-.4.9l2.4 2.4c.2.2.4.3.7.3h12.6c.4 0 .7-.5.4-.9l-2.4-2.4z"/>
    </svg>
  ),
  bnb: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#F3BA2F" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M12.1 14.5l3.9-3.9 3.9 3.9 2.3-2.3L16 6l-6.2 6.2 2.3 2.3zm-6.1 1.5l2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zm6.1 1.5L16 21.4l3.9-3.9 2.3 2.3L16 26l-6.2-6.2 2.3-2.3zm9.6-1.5l2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zM18.8 16L16 13.2 13.9 15.3l-.7.7L16 18.8l2.8-2.8z"/>
    </svg>
  ),
  xrp: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#23292F" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M23.1 8h2.4l-5.7 5.7c-2.1 2.1-5.5 2.1-7.6 0L6.5 8H8.9l4.6 4.6c1.3 1.3 3.4 1.3 4.7 0L23.1 8zM8.9 24H6.5l5.7-5.7c2.1-2.1 5.5-2.1 7.6 0l5.7 5.7h-2.4l-4.6-4.6c-1.3-1.3-3.4-1.3-4.7 0L8.9 24z"/>
    </svg>
  ),
  avalanche: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#E84142" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M11.5 21.5h-3c-.7 0-1-.3-.7-1l7.5-13c.3-.5.9-.5 1.2 0l1.8 3.2c.3.5.3 1.1 0 1.6l-5.3 9.2c-.2.3-.5.5-.9.5h-.6zm9 0h-3.8c-.4 0-.7-.2-.9-.5l-1.5-2.6c-.3-.5-.3-1.1 0-1.6l1.5-2.6c.2-.3.5-.5.9-.5h3.8c.4 0 .7.2.9.5l1.5 2.6c.3.5.3 1.1 0 1.6l-1.5 2.6c-.2.3-.5.5-.9.5z"/>
    </svg>
  ),
  usdc: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#2775CA" cx="16" cy="16" r="16"/>
      <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M11 6A12 12 0 0 0 11 26"/>
      <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M21 6A12 12 0 0 1 21 26"/>
      <path fill="#fff" d="M17 8v2.5c1.5.3 2.5 1.3 2.5 2.5h-2c0-.6-.7-1-1.5-1s-1.5.4-1.5 1c0 .4.3.8.8.9l2.2.6c1.3.4 2 1.3 2 2.5 0 1.2-1 2.2-2.5 2.5V22h-2v-2.5c-1.5-.3-2.5-1.3-2.5-2.5h2c0 .6.7 1 1.5 1s1.5-.4 1.5-1c0-.4-.3-.8-.8-.9l-2.2-.6c-1.3-.4-2-1.3-2-2.5 0-1.2 1-2.2 2.5-2.5V8h2z"/>
    </svg>
  ),
  usdt: (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <circle fill="#26A17B" cx="16" cy="16" r="16"/>
      <path fill="#fff" d="M17.9 17.9v-.003c-.109.008-.669.042-1.898.042-1.001 0-1.705-.03-1.938-.042v.003c-3.66-.168-6.4-.876-6.4-1.719 0-.843 2.74-1.551 6.4-1.722v2.744c.237.016.953.056 1.954.056 1.2 0 1.77-.046 1.882-.056v-2.741c3.654.168 6.387.879 6.387 1.719 0 .843-2.733 1.551-6.387 1.719zm0-3.724v-2.451h5.276V8.5H8.824v3.225h5.276v2.45c-4.145.195-7.264 1.09-7.264 2.157 0 1.068 3.119 1.961 7.264 2.156v7.712h3.6v-7.71c4.138-.196 7.25-1.089 7.25-2.158 0-1.066-3.112-1.96-7.25-2.156z"/>
    </svg>
  ),
};

interface FloatingLogo {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  logo: keyof typeof CryptoLogos;
  opacity: number;
}

function FloatingCryptoLogos() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logosRef = useRef<FloatingLogo[]>([]);
  const elementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const animationRef = useRef<number>();
  const [initialized, setInitialized] = useState(false);

  // Initialize logos with random positions (avoiding center)
  useEffect(() => {
    const logoTypes: (keyof typeof CryptoLogos)[] = ['bitcoin', 'ethereum', 'solana', 'bnb', 'avalanche', 'usdc', 'usdt'];
    const initialLogos: FloatingLogo[] = logoTypes.map((logo) => {
      // Spawn anywhere on screen except inside the red box (21-79% x, 27-70% y)
      let x: number, y: number;
      do {
        x = 5 + Math.random() * 90;  // 5-95% of screen width
        y = 5 + Math.random() * 90;  // 5-95% of screen height
      } while (x > 21 && x < 79 && y > 27 && y < 70); // Retry if inside red box

      // Random direction
      const angle = Math.random() * Math.PI * 2;

      // Size based on market cap ranking (bigger = higher market cap)
      const sizeByMarketCap: Record<string, [number, number]> = {
        bitcoin: [75, 90],      // #1 - largest
        ethereum: [65, 78],     // #2
        usdt: [56, 66],         // #3
        bnb: [48, 58],          // #4
        solana: [42, 52],       // #5
        usdc: [38, 46],         // #6
        avalanche: [34, 42],    // #7 - smallest
      };
      const [minSize, maxSize] = sizeByMarketCap[logo] || [45, 55];
      const size = minSize + Math.random() * (maxSize - minSize);

      return {
        id: logo,
        x,
        y,
        vx: Math.cos(angle),
        vy: Math.sin(angle),
        size,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        logo,
        opacity: 0.1 + Math.random() * 0.06,
      };
    });
    logosRef.current = initialLogos;
    elementsRef.current = new Array(initialLogos.length).fill(null);
    setInitialized(true);
  }, []);

  // Animation loop - directly manipulate DOM for smoothness
  useEffect(() => {
    if (!initialized) return;

    // Rectangular avoidance zone (center content area within first dark section)
    // Values are percentages of full page container - matching the user's red box
    const avoidLeft = 21;    // Left edge of content area
    const avoidRight = 79;   // Right edge of content area
    const avoidTop = 27;     // Just above headline
    const avoidBottom = 70;  // Just below CTA buttons
    const speed = 0.04; // Slow, gentle movement

    const animate = () => {
      const container = containerRef.current;
      if (!container) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const currentLogos = logosRef.current;

      currentLogos.forEach((logo, i) => {
        // Move at constant speed
        logo.x += logo.vx * speed;
        logo.y += logo.vy * speed;
        logo.rotation += logo.rotationSpeed;

        // Screen edge boundaries with bounce effect
        if (logo.x < 2) {
          logo.x = 2;
          logo.vx = Math.abs(logo.vx); // Bounce right
        } else if (logo.x > 98) {
          logo.x = 98;
          logo.vx = -Math.abs(logo.vx); // Bounce left
        }
        if (logo.y < 4) {
          logo.y = 4;
          logo.vy = Math.abs(logo.vy); // Bounce down
        } else if (logo.y > 88) {
          // Larger margin at bottom to prevent cutoff
          logo.y = 88;
          logo.vy = -Math.abs(logo.vy); // Bounce up
        }

        // Collision with other logos - pixel-accurate detection
        currentLogos.forEach((other, j) => {
          if (i >= j) return;

          // Convert percentage positions to actual pixels
          const logoPixelX = logo.x / 100 * containerWidth;
          const logoPixelY = logo.y / 100 * containerHeight;
          const otherPixelX = other.x / 100 * containerWidth;
          const otherPixelY = other.y / 100 * containerHeight;

          // Calculate distance in pixels (accurate regardless of aspect ratio)
          const dxPixels = logoPixelX - otherPixelX;
          const dyPixels = logoPixelY - otherPixelY;
          const distPixels = Math.sqrt(dxPixels * dxPixels + dyPixels * dyPixels);

          // Touch distance is simply half of each logo size in pixels
          const touchDistPixels = (logo.size + other.size) / 2;

          if (distPixels < touchDistPixels && distPixels > 1) {
            const nx = dxPixels / distPixels;
            const ny = dyPixels / distPixels;

            // Calculate separation in pixels
            const overlapPixels = touchDistPixels - distPixels;

            // Mass-weighted separation: smaller logo moves more
            const m1 = logo.size;
            const m2 = other.size;
            const totalMass = m1 + m2;
            const logoMoveRatio = m2 / totalMass;   // smaller mass = moves more
            const otherMoveRatio = m1 / totalMass;

            // Convert pixel separation back to percentage for each axis
            logo.x += (nx * overlapPixels * logoMoveRatio) / containerWidth * 100;
            logo.y += (ny * overlapPixels * logoMoveRatio) / containerHeight * 100;
            other.x -= (nx * overlapPixels * otherMoveRatio) / containerWidth * 100;
            other.y -= (ny * overlapPixels * otherMoveRatio) / containerHeight * 100;

            // Elastic collision with momentum - velocity along collision normal
            const v1n = logo.vx * nx + logo.vy * ny;
            const v2n = other.vx * nx + other.vy * ny;

            // Only bounce if they're approaching each other
            if (v1n - v2n < 0) {
              // Elastic collision formulas (momentum + energy conservation)
              const v1nNew = (v1n * (m1 - m2) + 2 * m2 * v2n) / totalMass;
              const v2nNew = (v2n * (m2 - m1) + 2 * m1 * v1n) / totalMass;

              // Apply velocity change along collision normal
              logo.vx += (v1nNew - v1n) * nx;
              logo.vy += (v1nNew - v1n) * ny;
              other.vx += (v2nNew - v2n) * nx;
              other.vy += (v2nNew - v2n) * ny;
            }
          }
        });

        // Add random direction changes for organic movement
        if (Math.random() < 0.005) {
          const randomAngle = (Math.random() - 0.5) * 0.5;
          const cos = Math.cos(randomAngle);
          const sin = Math.sin(randomAngle);
          const newVx = logo.vx * cos - logo.vy * sin;
          const newVy = logo.vx * sin + logo.vy * cos;
          logo.vx = newVx;
          logo.vy = newVy;
        }

        // Normalize velocity to keep constant speed
        const currentSpeed = Math.sqrt(logo.vx * logo.vx + logo.vy * logo.vy);
        if (currentSpeed > 0.01) {
          logo.vx /= currentSpeed;
          logo.vy /= currentSpeed;
        }

        // Avoid center content area - HARD BOUNDARY using logo visual radius
        const logoRadiusX = (logo.size / 2) / containerWidth * 100;
        const logoRadiusY = (logo.size / 2) / containerHeight * 100;

        // Check if logo is approaching the zone and clamp position
        const logoRightEdge = logo.x + logoRadiusX;
        const logoLeftEdge = logo.x - logoRadiusX;
        const logoBottomEdge = logo.y + logoRadiusY;
        const logoTopEdge = logo.y - logoRadiusY;

        // If logo would be inside the zone, clamp to nearest edge
        if (logoRightEdge > avoidLeft && logoLeftEdge < avoidRight &&
            logoBottomEdge > avoidTop && logoTopEdge < avoidBottom) {

          const distToLeft = logoRightEdge - avoidLeft;
          const distToRight = avoidRight - logoLeftEdge;
          const distToTop = logoBottomEdge - avoidTop;
          const distToBottom = avoidBottom - logoTopEdge;

          const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

          // Clamp position to stay outside zone
          if (minDist === distToLeft) {
            logo.x = avoidLeft - logoRadiusX;
            if (logo.vx > 0) logo.vx = -logo.vx;
          } else if (minDist === distToRight) {
            logo.x = avoidRight + logoRadiusX;
            if (logo.vx < 0) logo.vx = -logo.vx;
          } else if (minDist === distToTop) {
            logo.y = avoidTop - logoRadiusY;
            if (logo.vy > 0) logo.vy = -logo.vy;
          } else {
            logo.y = avoidBottom + logoRadiusY;
            if (logo.vy < 0) logo.vy = -logo.vy;
          }
        }

        // Update DOM directly (no React re-render)
        const el = elementsRef.current[i];
        if (el) {
          el.style.left = `${logo.x}%`;
          el.style.top = `${logo.y}%`;
          el.style.transform = `translate(-50%, -50%) rotate(${logo.rotation}deg)`;
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initialized]);

  if (!initialized) return null;

  return (
    <div ref={containerRef} className="absolute top-0 left-0 right-0 h-screen overflow-hidden pointer-events-none">
      {logosRef.current.map((logo, i) => (
        <div
          key={logo.id}
          ref={(el) => { elementsRef.current[i] = el; }}
          className="absolute will-change-transform"
          style={{
            left: `${logo.x}%`,
            top: `${logo.y}%`,
            width: logo.size,
            height: logo.size,
            opacity: logo.opacity,
            transform: `translate(-50%, -50%) rotate(${logo.rotation}deg)`,
          }}
        >
          {CryptoLogos[logo.logo]}
        </div>
      ))}
    </div>
  );
}

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

      {/* Floating Crypto Logos - Dynamic with collision avoidance */}
      <FloatingCryptoLogos />

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
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 pb-24">
        <div className="max-w-5xl mx-auto space-y-32">
          
          {/* Hero Section */}
          <div className="text-center space-y-12 pt-20">
            {/* Headline with decorative lines */}
            <div className="flex justify-center w-full">
              <div className="relative inline-block max-w-full">
                {/* Decorative vertical lines - hidden on mobile */}
                <div className="hidden sm:block absolute -left-16 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent"></div>
                <div className="hidden sm:block absolute -right-16 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent"></div>

                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light text-white leading-tight px-4 text-center">
                  AI executes. You set the boundaries.
                </h1>
              </div>
            </div>
            
            {/* Subheadline (outside brackets) */}
            <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-300 leading-relaxed max-w-4xl mx-auto">
              Design rule-based strategies, define risk constraints, and let AI execute <br className="hidden sm:block" />
              within them.
            </p>
            
            <div className="flex flex-row gap-3 sm:gap-6 justify-center pt-4">
              <Button
                size="lg"
                onClick={handleBuildStrategy}
                className="px-4 py-2.5 sm:px-16 sm:py-7 text-xs sm:text-base md:text-lg lg:text-xl bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-2xl shadow-[0_0_40px_rgba(37,99,235,0.5)] hover:shadow-[0_0_50px_rgba(37,99,235,0.6)] transition-all hover:scale-105"
              >
                Build a Strategy
              </Button>
              <Link href="/arena">
                <Button size="lg" variant="outline" className="px-4 py-2.5 sm:px-16 sm:py-7 text-xs sm:text-base md:text-lg lg:text-xl bg-transparent border-2 border-gray-700 text-white hover:text-white hover:border-gray-600 hover:bg-gray-800/20 rounded-xl sm:rounded-2xl transition-all">
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

        </div>
      </div>

      {/* Divider - exact boundary between dark and white */}
      <div className="relative h-px bg-[#070d1a]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full z-20"></div>
      </div>

      {/* Full-width White/Blue Section */}
      <div className="relative z-10 bg-gradient-to-b from-white to-blue-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-28">
          {/* AI Engine Section */}
            <div className="text-center max-w-4xl mx-auto space-y-10">
              <div className="inline-flex items-center gap-4 mb-10 p-4 rounded-xl bg-white border border-blue-200 shadow-sm">
                <div className="p-3 rounded-lg bg-blue-100 border border-blue-200">
                  <Cpu className="w-7 h-7 text-blue-600" />
                </div>
                <div className="w-8 h-px bg-gradient-to-r from-blue-400 to-blue-200"></div>
                <div className="p-3 rounded-lg bg-blue-100 border border-blue-200">
                  <GitBranch className="w-7 h-7 text-blue-600" />
                </div>
                <div className="w-8 h-px bg-gradient-to-r from-blue-200 to-blue-400"></div>
                <div className="p-3 rounded-lg bg-blue-100 border border-blue-200">
                  <Settings className="w-7 h-7 text-blue-600" />
                </div>
              </div>

              <h2 className="text-4xl sm:text-5xl font-light text-slate-900">Choose your AI engine</h2>

              <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                Different AI models reason differently. You choose which model runs your strategy — and can change it at any time.
              </p>

              {/* AI Provider Logos */}
              <div className="flex flex-wrap justify-center items-center gap-12 sm:gap-16 mt-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/Claude.png" alt="Claude" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Claude</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/ChatGPT.png" alt="ChatGPT" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">ChatGPT</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/Gemini.png" alt="Gemini" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Gemini</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/Qwen.png" alt="Qwen" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Qwen</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/Deepseek.png" alt="Deepseek" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Deepseek</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden">
                    <img src="/logos/Grok.png" alt="Grok" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Grok</span>
                </div>
              </div>
            </div>

            {/* Trust & Safety */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-16 max-w-5xl mx-auto">
              <div className="group p-8 rounded-xl bg-white border border-blue-100 hover:border-blue-300 transition-all hover:shadow-lg hover:shadow-blue-200/50">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-100 mb-5 group-hover:bg-blue-200 transition-all group-hover:scale-110">
                  <Coins className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">$100K Virtual Capital</h3>
                <p className="text-sm text-slate-600">Test strategies risk-free with simulated funds</p>
              </div>
              <div className="group p-8 rounded-xl bg-white border border-blue-100 hover:border-blue-300 transition-all hover:shadow-lg hover:shadow-blue-200/50">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-100 mb-5 group-hover:bg-blue-200 transition-all group-hover:scale-110">
                  <Lock className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Encrypted API Keys</h3>
                <p className="text-sm text-slate-600">No withdrawal access. Trade-only permissions</p>
              </div>
              <div className="group p-8 rounded-xl bg-white border border-blue-100 hover:border-blue-300 transition-all hover:shadow-lg hover:shadow-blue-200/50">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-100 mb-5 group-hover:bg-blue-200 transition-all group-hover:scale-110">
                  <WalletMinimal className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Non-Custodial</h3>
                <p className="text-sm text-slate-600">Your funds stay on your exchange</p>
              </div>
              <div className="group p-8 rounded-xl bg-white border border-blue-100 hover:border-blue-300 transition-all hover:shadow-lg hover:shadow-blue-200/50">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-100 mb-5 group-hover:bg-blue-200 transition-all group-hover:scale-110">
                  <Power className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Instant Kill Switch</h3>
                <p className="text-sm text-slate-600">Stop all activity with one click</p>
              </div>
            </div>
          </div>
      </div>

      {/* Bottom Divider - exact boundary between white and dark */}
      <div className="relative h-px bg-[#070d1a]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-400 rounded-full z-20"></div>
      </div>

      {/* Continue with dark background */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto space-y-32 py-20">

          {/* What You Can Build */}
          <div className="text-center space-y-16">
            <h2 className="text-4xl sm:text-5xl font-light text-white">What you can build</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="group relative p-10 rounded-2xl bg-gradient-to-br from-blue-950/30 via-blue-900/10 to-transparent border border-blue-500/30 hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-blue-500/20">
                <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-all"></div>
                <div className="relative flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/30">
                    <ShieldCheck className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xl text-gray-200">Custom rules & risk limits</p>
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
                    <Clock className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xl text-gray-200">24/7 Automatic Trading</p>
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
