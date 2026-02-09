"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EnvelopeClosedIcon, GearIcon, ExitIcon, HamburgerMenuIcon, Cross1Icon, PersonIcon } from "@radix-ui/react-icons";
import { DollarSign, BarChart3 } from "lucide-react";
import { useAuthGate } from "./auth-gate-provider";
import { getBearerToken } from "@/lib/api/clientAuth";
import { ChevronDown } from "lucide-react";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, gatedNavigate } = useAuthGate();
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch profile data when user changes
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      if (!user?.id) {
        setUsername(null);
        setAvatarUrl(null);
        setBalanceCents(null);
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", user.id)
          .single();

        if (!cancelled) {
          setUsername(profile?.username || null);
          setAvatarUrl(profile?.avatar_url || null);
        }

        // Fetch balance
        const bearer = await getBearerToken();
        if (bearer && !cancelled) {
          const balanceRes = await fetch("/api/credits", {
            headers: { Authorization: bearer },
          });
          if (balanceRes.ok) {
            const data = await balanceRes.json();
            // Use balance_cents (new) or fallback to balance (legacy, 1 credit = 1 cent)
            setBalanceCents(data.credits?.balance_cents ?? data.credits?.balance ?? null);
          }
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const isActive = (path: string) => pathname === path;

  // Handler for gated navigation links
  const handleGatedClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    gatedNavigate(href);
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", gated: true },
    { href: "/arena", label: "Arena", gated: false },
    { href: "/community", label: "Community", gated: true },
    { href: "/pricing", label: "Pricing", gated: false },
  ];

  return (
    <nav className="border-b border-border/50 bg-[#070d1a] backdrop-blur-xl sticky top-0 z-50 shadow-lg shadow-black/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between">
          {/* Left: Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-2 group cursor-pointer">
              <img
                src="/brand/corebound-logo.svg"
                alt="Corebound"
                className="h-10 sm:h-14 w-auto transition-opacity group-hover:opacity-90 pointer-events-auto"
              />
            </Link>
          </div>

          {/* Center: Desktop Menu Items */}
          <div className="hidden lg:flex items-center gap-1 xl:gap-2">
            {navLinks.map((link) => (
              link.gated ? (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleGatedClick(e, link.href)}
                  className={`px-3 xl:px-4 py-2 text-sm xl:text-base font-medium rounded-lg transition-all duration-300 cursor-pointer whitespace-nowrap ${
                    isActive(link.href)
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 xl:px-4 py-2 text-sm xl:text-base font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${
                    isActive(link.href)
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}
          </div>

          {/* Right: User Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            {loading ? (
              <span className="text-xs sm:text-sm text-gray-400">Loading...</span>
            ) : user ? (
              <>
                {/* Balance Display (USD) - Hidden on very small screens */}
                {balanceCents !== null && (
                  <Link
                    href="/settings/billing"
                    className="hidden sm:flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-blue-950/30 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300"
                    title="View balance"
                  >
                    <span className="text-xs sm:text-sm font-medium text-blue-400">
                      ${(balanceCents / 100).toFixed(2)}
                    </span>
                  </Link>
                )}

                {/* Profile Dropdown - Desktop */}
                <div
                  className="relative hidden sm:block"
                  onMouseEnter={() => setProfileDropdownOpen(true)}
                  onMouseLeave={() => setProfileDropdownOpen(false)}
                >
                  <div className="flex items-center gap-2 px-2 sm:px-3 py-2 hover:bg-blue-950/30 rounded-lg transition-all duration-300 cursor-pointer">
                    <Link
                      href={`/u/${user.id}`}
                      className="relative w-8 h-8 sm:w-9 sm:h-9"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={username || "Profile"}
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-blue-800 hover:border-blue-600 transition-colors"
                        />
                      ) : (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-900 flex items-center justify-center text-white font-bold text-sm sm:text-base border-2 border-blue-700 hover:border-blue-600 transition-colors">
                          {(username || user.email || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <span className="hidden md:inline-block text-sm xl:text-base font-medium text-white truncate max-w-[100px] xl:max-w-[150px]">
                      {username || user.email?.split("@")[0] || `user_${user.id.substring(0, 8)}`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Dropdown Menu */}
                  {profileDropdownOpen && (
                    <>
                      {/* Invisible bridge to prevent dropdown from closing when moving mouse */}
                      <div className="absolute right-0 h-2 w-56" />

                      <div className="absolute right-0 mt-2 w-56 bg-[#0a1628] border border-blue-500/20 rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50">
                        <div className="py-2">
                          {/* My Profile */}
                          <Link
                            href={`/u/${user.id}`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-950/30 transition-all duration-200 text-gray-300 hover:text-white"
                          >
                            <PersonIcon className="w-5 h-5" />
                            <span className="text-base">My Profile</span>
                          </Link>

                          {/* Messages */}
                          <Link
                            href="/messages"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-950/30 transition-all duration-200 text-gray-300 hover:text-white"
                          >
                            <EnvelopeClosedIcon className="w-5 h-5" />
                            <span className="text-base">Messages</span>
                          </Link>

                          {/* Billing & Balance */}
                          <Link
                            href="/settings/billing"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-950/30 transition-all duration-200 text-gray-300 hover:text-white"
                          >
                            <DollarSign className="w-5 h-5" />
                            <span className="text-base">Billing & Balance</span>
                          </Link>

                          {/* Usage */}
                          <Link
                            href="/settings/usage"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-950/30 transition-all duration-200 text-gray-300 hover:text-white"
                          >
                            <BarChart3 className="w-5 h-5" />
                            <span className="text-base">Usage</span>
                          </Link>

                          {/* Settings */}
                          <a
                            href="/settings"
                            onClick={(e) => {
                              setProfileDropdownOpen(false);
                              handleGatedClick(e, "/settings");
                            }}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-950/30 transition-all duration-200 text-gray-300 hover:text-white cursor-pointer"
                          >
                            <GearIcon className="w-5 h-5" />
                            <span className="text-base">Settings</span>
                          </a>

                          {/* Divider */}
                          <div className="my-2 h-px bg-blue-500/20" />

                          {/* Sign Out */}
                          <button
                            onClick={() => {
                              setProfileDropdownOpen(false);
                              handleSignOut();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-950/30 transition-all duration-200 text-gray-300 hover:text-red-400"
                          >
                            <ExitIcon className="w-5 h-5" />
                            <span className="text-base">Sign Out</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile: Avatar only (clickable to open menu) */}
                <button
                  className="sm:hidden relative w-8 h-8"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={username || "Profile"}
                      className="w-8 h-8 rounded-full object-cover border-2 border-blue-800"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-white font-bold text-sm border-2 border-blue-700">
                      {(username || user.email || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              </>
            ) : (
              <Link href="/auth">
                <Button size="sm" variant="outline" className="bg-transparent border-2 border-blue-600 text-blue-500 hover:text-blue-400 hover:border-blue-500 hover:bg-blue-950/30 rounded-lg sm:rounded-xl px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base transition-all duration-300">
                  Sign In
                </Button>
              </Link>
            )}

            {/* Mobile Menu Toggle - Only show on tablet/small laptop when logged in */}
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-blue-950/30 rounded-lg transition-all"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <Cross1Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <HamburgerMenuIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-blue-500/20 bg-[#070d1a]">
          <div className="container mx-auto px-4 py-4 space-y-2">
            {/* Navigation Links */}
            {navLinks.map((link) => (
              link.gated ? (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    handleGatedClick(e, link.href);
                    setMobileMenuOpen(false);
                  }}
                  className={`block px-4 py-3 text-base font-medium rounded-lg transition-all duration-300 ${
                    isActive(link.href)
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 text-base font-medium rounded-lg transition-all duration-300 ${
                    isActive(link.href)
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}

            {/* User Section in Mobile Menu */}
            {user && (
              <>
                <div className="my-3 h-px bg-blue-500/20" />

                {/* Balance - Show in mobile menu */}
                {balanceCents !== null && (
                  <Link
                    href="/settings/billing"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between px-4 py-3 text-base font-medium rounded-lg text-gray-300 hover:text-white hover:bg-blue-950/30 transition-all"
                  >
                    <span>Balance</span>
                    <span className="text-blue-400">${(balanceCents / 100).toFixed(2)}</span>
                  </Link>
                )}

                {/* My Profile */}
                <Link
                  href={`/u/${user.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-lg text-gray-300 hover:text-white hover:bg-blue-950/30 transition-all"
                >
                  <PersonIcon className="w-5 h-5" />
                  My Profile
                </Link>

                {/* Messages */}
                <Link
                  href="/messages"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-lg text-gray-300 hover:text-white hover:bg-blue-950/30 transition-all"
                >
                  <EnvelopeClosedIcon className="w-5 h-5" />
                  Messages
                </Link>

                {/* Settings */}
                <a
                  href="/settings"
                  onClick={(e) => {
                    handleGatedClick(e, "/settings");
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-base font-medium rounded-lg text-gray-300 hover:text-white hover:bg-blue-950/30 transition-all cursor-pointer"
                >
                  <GearIcon className="w-5 h-5" />
                  Settings
                </a>

                {/* Sign Out */}
                <button
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base font-medium rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-950/30 transition-all"
                >
                  <ExitIcon className="w-5 h-5" />
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
