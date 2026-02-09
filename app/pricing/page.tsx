"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, TrendingUp, Crown, Plus } from "lucide-react";
import { useAuthGate } from "@/components/auth-gate-provider";
import { getBearerToken } from "@/lib/api/clientAuth";

interface Plan {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  features: string[];
  is_active: boolean;
}

interface UserBalance {
  balance_cents: number;
  subscription: {
    plan_id: string | null;
    plan_name: string;
    status: string;
  };
}

// Savings percentage for each tier (used on plan cards)
const TIER_SAVINGS: Record<string, number> = {
  on_demand: 0,
  pro: 20,
  pro_plus: 26,
  ultra: 33,
};

// Value per dollar for each tier (used in comparison table)
const TIER_VALUE_PER_DOLLAR: Record<string, string> = {
  on_demand: "$1.00",
  pro: "$1.25",
  pro_plus: "$1.35",
  ultra: "$1.50",
};

// Estimated cost per AI decision (based on typical usage)
const MODEL_COSTS = [
  { name: "GPT-4o-mini", cost: "~$0.002", description: "Fast & efficient" },
  { name: "GPT-4o", cost: "~$0.01", description: "Balanced performance" },
  { name: "Claude Sonnet", cost: "~$0.015", description: "Thoughtful analysis" },
  { name: "Claude Opus", cost: "~$0.06", description: "Deep reasoning" },
  { name: "DeepSeek", cost: "~$0.003", description: "Cost effective" },
  { name: "Gemini Pro", cost: "~$0.005", description: "Google's latest" },
];

export default function PricingPage() {
  const { user, gatedNavigate } = useAuthGate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userBalance, setUserBalance] = useState<UserBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
    if (user) {
      loadUserBalance();
    }
  }, [user]);

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/subscriptions/plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error("Failed to load plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserBalance = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch("/api/credits", {
        headers: { Authorization: bearer },
      });
      if (res.ok) {
        const data = await res.json();
        setUserBalance({
          balance_cents: data.credits?.balance_cents ?? data.credits?.balance ?? 0,
          subscription: {
            plan_id: data.subscription?.plan_id || null,
            plan_name: data.subscription?.plan_name || "No Plan",
            status: data.subscription?.status || "inactive",
          },
        });
      }
    } catch (error) {
      console.error("Failed to load user balance:", error);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    if (!user) {
      gatedNavigate("/pricing", {
        title: "Sign in to subscribe",
        description: "Create an account or sign in to subscribe.",
      });
      return;
    }

    setSubscribing(planId);
    try {
      const bearer = await getBearerToken();
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer || "",
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      const data = await res.json();
      if (res.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubscribing(null);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(0)}`;
  };

  const formatBalance = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case "pro":
        return <Zap className="w-6 h-6" />;
      case "pro_plus":
        return <TrendingUp className="w-6 h-6" />;
      case "ultra":
        return <Crown className="w-6 h-6" />;
      default:
        return <Zap className="w-6 h-6" />;
    }
  };

  const getSavings = (planId: string) => {
    return TIER_SAVINGS[planId] || 0;
  };

  const getValuePerDollar = (planId: string) => {
    return TIER_VALUE_PER_DOLLAR[planId] || "$1.00";
  };

  const isCurrentPlan = (planId: string) => {
    return userBalance?.subscription?.plan_id === planId;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-[#070d1a] to-blue-950/20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(30, 58, 138, 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(30, 58, 138, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 90%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 90%)",
          }}
        />
      </div>

      <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-blue-900/30 rounded-full blur-3xl opacity-40" />
      <div className="absolute bottom-20 right-10 w-[600px] h-[600px] bg-blue-800/25 rounded-full blur-3xl opacity-40" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Header */}
          <div className="text-center space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light text-white">
              Simple, transparent pricing
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto">
              Pay only for the AI you use. Subscribers get more value per dollar.
            </p>

            {/* Current balance display */}
            {user && userBalance && (
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-blue-950/30 border border-blue-500/20">
                <span className="text-gray-400">Your balance:</span>
                <span className="text-2xl font-semibold text-blue-400">
                  {formatBalance(userBalance.balance_cents)}
                </span>
                <Badge variant="outline" className="ml-2 border-blue-500/30 text-blue-400">
                  {userBalance.subscription.plan_name}
                </Badge>
              </div>
            )}
          </div>

          {/* Pricing Cards */}
          {loading ? (
            <div className="text-center text-gray-400 py-20">Loading plans...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {plans.map((plan) => {
                const isCurrent = isCurrentPlan(plan.id);
                const savings = getSavings(plan.id);

                return (
                  <div
                    key={plan.id}
                    className="relative group rounded-2xl p-8 transition-all duration-300 bg-white border border-gray-200 hover:border-blue-400 hover:shadow-lg"
                  >
                    {isCurrent && (
                      <div className="absolute -top-3 right-4">
                        <Badge variant="outline" className="bg-green-50 text-green-600 border-green-300">
                          Current Plan
                        </Badge>
                      </div>
                    )}

                    <div className="flex flex-col h-full space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-blue-100 text-blue-600 border border-blue-200">
                          {getPlanIcon(plan.id)}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                          <p className="text-sm text-gray-500">{plan.description}</p>
                        </div>
                      </div>

                      {/* Price and Value */}
                      <div className="space-y-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900">
                            {formatPrice(plan.price_cents)}
                          </span>
                          <span className="text-gray-500">/month</span>
                        </div>
                        {savings > 0 && (
                          <p className="text-green-600 font-semibold">
                            Save {savings}% on every AI call
                          </p>
                        )}
                      </div>

                      {/* Features */}
                      <ul className="space-y-3 flex-grow">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-600 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrent || subscribing === plan.id}
                        className={`w-full py-6 text-base rounded-xl transition-all ${
                          isCurrent
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {isCurrent ? "Current Plan" : subscribing === plan.id ? "Redirecting..." : "Subscribe"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Funds Option */}
          <div className="max-w-4xl mx-auto">
            <div className="p-8 rounded-2xl bg-gradient-to-r from-purple-950/30 to-blue-950/30 border border-purple-500/20">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/30">
                    <Plus className="w-7 h-7 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">
                      Add funds to your balance
                    </h3>
                    <p className="text-gray-400">
                      Top up anytime. Subscribers get better rates on every AI decision.
                    </p>
                  </div>
                </div>
                <Link href={user ? "/settings/billing" : "/auth"}>
                  <Button
                    variant="outline"
                    className="whitespace-nowrap border-purple-500/50 text-purple-300 hover:bg-purple-500/10 hover:text-purple-200"
                  >
                    Add Funds
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="relative py-8">
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
          </div>

          {/* How Pricing Works */}
          <div className="space-y-8">
            <div className="text-center space-y-3">
              <h2 className="text-2xl sm:text-3xl font-light text-white mb-3">
                How pricing works
              </h2>
              <p className="text-gray-400 max-w-3xl mx-auto">
                You pay based on actual AI token usage. Subscribers get more AI usage per dollar.
              </p>
            </div>

            {/* Tier Comparison */}
            <div className="max-w-xl mx-auto">
              <div className="rounded-xl bg-blue-950/20 border border-blue-500/20 overflow-hidden">
                <div className="grid grid-cols-3 gap-0 text-center">
                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-gray-400 text-sm">Plan</p>
                  </div>
                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-gray-400 text-sm">$1 Gets You</p>
                  </div>
                  <div className="p-4 border-b border-blue-500/20">
                    <p className="text-gray-400 text-sm">Sessions</p>
                  </div>

                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-white font-medium">On-demand</p>
                  </div>
                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-gray-400">$1.00 of AI usage</p>
                  </div>
                  <div className="p-4 border-b border-blue-500/20">
                    <p className="text-gray-400">Up to 3</p>
                  </div>

                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-white font-medium">Pro</p>
                  </div>
                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-green-400 font-medium">$1.25 of AI usage</p>
                  </div>
                  <div className="p-4 border-b border-blue-500/20">
                    <p className="text-gray-400">Up to 3</p>
                  </div>

                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-white font-medium">Pro+</p>
                  </div>
                  <div className="p-4 border-b border-r border-blue-500/20">
                    <p className="text-green-400 font-medium">$1.35 of AI usage</p>
                  </div>
                  <div className="p-4 border-b border-blue-500/20">
                    <p className="text-green-400 font-medium">Unlimited</p>
                  </div>

                  <div className="p-4 border-r border-blue-500/20">
                    <p className="text-white font-medium">Ultra</p>
                  </div>
                  <div className="p-4 border-r border-blue-500/20">
                    <p className="text-green-400 font-medium">$1.50 of AI usage</p>
                  </div>
                  <div className="p-4">
                    <p className="text-green-400 font-medium">Unlimited</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Costs */}
            <div className="pt-8">
              <h3 className="text-xl font-light text-white text-center mb-6">
                Estimated cost per AI decision (on-demand rates)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {MODEL_COSTS.map((model) => (
                  <div
                    key={model.name}
                    className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/20 text-center hover:border-blue-500/40 transition-all"
                  >
                    <p className="text-white font-medium mb-1">{model.name}</p>
                    <p className="text-2xl font-bold text-blue-400 mb-1">{model.cost}</p>
                    <p className="text-xs text-gray-500">{model.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-center text-sm text-gray-500 mt-4">
                Subscribers pay less. Costs vary based on decision complexity and market context.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="space-y-8">
            <h2 className="text-2xl sm:text-3xl font-light text-white text-center">
              Frequently asked questions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-xl bg-blue-950/20 border border-blue-500/20">
                <h3 className="text-white font-medium mb-2">What happens when my balance runs out?</h3>
                <p className="text-gray-400 text-sm">
                  Your strategies will pause until you add more funds. You can top up your balance
                  anytime from the billing page.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-blue-950/20 border border-blue-500/20">
                <h3 className="text-white font-medium mb-2">Does my balance expire?</h3>
                <p className="text-gray-400 text-sm">
                  No! Your balance never expires. Add funds when you need them and they stay
                  in your account until used.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-blue-950/20 border border-blue-500/20">
                <h3 className="text-white font-medium mb-2">Why subscribe instead of pay-as-you-go?</h3>
                <p className="text-gray-400 text-sm">
                  Subscribers get better rates on every AI decision. Ultra subscribers get 50% more
                  AI usage for the same money compared to on-demand.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-blue-950/20 border border-blue-500/20">
                <h3 className="text-white font-medium mb-2">Are my payments secure?</h3>
                <p className="text-gray-400 text-sm">
                  Absolutely. We use Stripe, the industry-leading payment processor trusted by millions
                  of businesses worldwide. Your card details are never stored on our servers.
                </p>
              </div>
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center py-12">
            <p className="text-xl text-gray-300 mb-8">
              Ready to automate your trading with AI?
            </p>
            {!user && (
              <Link href="/auth">
                <Button
                  size="lg"
                  className="px-12 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:scale-105"
                >
                  Get Started
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
