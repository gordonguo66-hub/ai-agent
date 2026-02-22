"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { Zap, TrendingUp, Crown, ArrowRight, CreditCard, History, DollarSign, Check, Loader2, Sparkles, XCircle } from "lucide-react";

interface TopupPackage {
  id: string;
  amount_cents: number;
  display: string;
  popular: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  features: string[];
}

interface BalanceTransaction {
  id: string;
  amount: number;           // Amount in cents (positive for topup, negative for usage)
  balance_after: number;    // Balance in cents after this transaction
  transaction_type: string;
  description: string;
  metadata: any;
  created_at: string;
  // Optional USD values added by API
  amount_usd?: string;
  balance_after_usd?: string;
}

interface UserData {
  credits: {
    balance: number;
    balance_cents: number;
    balance_usd: string;
    subscription_budget_cents: number;
    subscription_budget_usd: string;
    subscription_budget_granted_cents: number;
    lifetime_used: number;
    lifetime_spent_cents: number;
    updated_at?: string;
  };
  subscription: {
    plan_id: string | null;
    plan_name: string;
    status: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
    price_cents: number;
    features: string[];
  };
}

function BillingContent() {
  const searchParams = useSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  // Default packages - shown immediately, updated if API returns different data
const DEFAULT_PACKAGES: TopupPackage[] = [
  { id: 'topup_5', amount_cents: 500, display: '$5', popular: false },
  { id: 'topup_10', amount_cents: 1000, display: '$10', popular: false },
  { id: 'topup_25', amount_cents: 2500, display: '$25', popular: true },
  { id: 'topup_50', amount_cents: 5000, display: '$50', popular: false },
  { id: 'topup_100', amount_cents: 10000, display: '$100', popular: false },
];
const [topupPackages, setTopupPackages] = useState<TopupPackage[]>(DEFAULT_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustomTopup, setIsCustomTopup] = useState(false);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);

  useEffect(() => {
    loadData();

    // Check for success message from Stripe redirect
    const success = searchParams.get("success");
    const amount = searchParams.get("amount");
    const plan = searchParams.get("plan");
    if (success === "topup" && amount) {
      setSuccessMessage(`Successfully added $${(parseInt(amount) / 100).toFixed(2)} to your balance!`);
      window.history.replaceState({}, "", "/settings/billing");
    } else if (success === "subscription" && plan) {
      const planName = plan === "pro" ? "Pro" : plan === "pro_plus" ? "Pro+" : plan === "ultra" ? "Ultra" : plan;
      setSuccessMessage(`Successfully subscribed to ${planName}! Your subscription is now active.`);
      window.history.replaceState({}, "", "/settings/billing");
    }
  }, [searchParams]);

  const loadData = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      // Load user credits and subscription
      const creditsRes = await fetch("/api/credits", {
        headers: { Authorization: bearer },
      });
      if (creditsRes.ok) {
        const data = await creditsRes.json();
        setUserData(data);
      }

      // Load available plans
      const plansRes = await fetch("/api/subscriptions/plans");
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans || []);
      }

      // Load transaction history
      setLoadingTransactions(true);
      const txRes = await fetch("/api/credits/usage?limit=20", {
        headers: { Authorization: bearer },
      });
      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions || []);
      }

      // Load top-up packages
      const packagesRes = await fetch("/api/credits/purchase");
      if (packagesRes.ok) {
        const data = await packagesRes.json();
        setTopupPackages(data.packages || []);
      }
    } catch (error) {
      console.error("Failed to load billing data:", error);
    } finally {
      setLoading(false);
      setLoadingTransactions(false);
    }
  };

  const handleTopup = async (packageId: string) => {
    try {
      setPurchasingPackage(packageId);
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ package_id: packageId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (error: any) {
      console.error("Failed to add funds:", error);
      alert(error.message || "Failed to start checkout. Please try again.");
    } finally {
      setPurchasingPackage(null);
    }
  };

  const handleCustomTopup = async () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    try {
      setIsCustomTopup(true);
      const bearer = await getBearerToken();
      if (!bearer) return;

      const amountCents = Math.round(amount * 100);

      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ custom_amount_cents: amountCents }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (error: any) {
      console.error("Failed to add funds:", error);
      alert(error.message || "Failed to start checkout. Please try again.");
    } finally {
      setIsCustomTopup(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      setPurchasingPlan(planId);
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (error: any) {
      console.error("Failed to start subscription:", error);
      alert(error.message || "Failed to start checkout. Please try again.");
    } finally {
      setPurchasingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You'll keep access until the end of your billing period.")) {
      return;
    }

    try {
      setCancelingSubscription(true);
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to cancel subscription");
      }

      setSuccessMessage("Your subscription has been canceled. You'll keep access until the end of your billing period.");
      loadData(); // Reload to show updated status
    } catch (error: any) {
      console.error("Failed to cancel subscription:", error);
      alert(error.message || "Failed to cancel subscription. Please try again.");
    } finally {
      setCancelingSubscription(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  const formatUsd = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getMoreUsagePercent = (planId: string | null) => {
    // Returns how much more AI usage subscribers get compared to on-demand
    switch (planId) {
      case "pro": return 25;
      case "pro_plus": return 35;
      case "ultra": return 50;
      default: return 0;
    }
  };

  const getSavePercent = (planId: string | null) => {
    // Returns how much subscribers save on every AI call compared to on-demand
    switch (planId) {
      case "pro": return 20;
      case "pro_plus": return 26;
      case "ultra": return 33;
      default: return 0;
    }
  };

  const getPlanIcon = (planId: string | null) => {
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

  const getPlanIconColor = (planId: string | null, isCurrent: boolean = false) => {
    // Each tier gets a distinctive color
    switch (planId) {
      case "pro":
        return "text-blue-500"; // Electric blue
      case "pro_plus":
        return "text-violet-500"; // Purple/Violet
      case "ultra":
        return "text-amber-500"; // Gold
      default:
        return isCurrent ? "text-blue-500" : "text-gray-500";
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case "signup_bonus":
        return { label: "Bonus", color: "bg-green-100 text-green-700 border-green-200" };
      case "subscription_grant":
        return { label: "Subscription", color: "bg-blue-100 text-blue-700 border-blue-200" };
      case "usage":
        return { label: "AI Usage", color: "bg-orange-100 text-orange-700 border-orange-200" };
      case "subscription_usage":
        return { label: "Sub Usage", color: "bg-purple-100 text-purple-700 border-purple-200" };
      case "subscription_budget_grant":
        return { label: "Budget Grant", color: "bg-blue-100 text-blue-700 border-blue-200" };
      case "purchase":
      case "topup":
        return { label: "Top-up", color: "bg-green-100 text-green-700 border-green-200" };
      case "refund":
        return { label: "Refund", color: "bg-cyan-100 text-cyan-700 border-cyan-200" };
      case "adjustment":
        return { label: "Adjustment", color: "bg-gray-100 text-gray-700 border-gray-200" };
      default:
        return { label: type, color: "bg-gray-100 text-gray-700 border-gray-200" };
    }
  };

  const getTierLabel = (planId: string | null) => {
    if (!planId || planId === "on_demand") {
      return { label: "On-Demand", color: "text-gray-400" };
    }
    const savePercent = getSavePercent(planId);
    return { label: `Save ${savePercent}% on every AI call`, color: "text-green-400" };
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Billing & Balance</h1>
            <p className="text-gray-300 mt-1">
              Manage your subscription and view usage history.
            </p>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-20">Loading billing information...</div>
          ) : userData ? (
            <>
              {/* Current Plan & Credits Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current Subscription */}
                <Card className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={getPlanIconColor(userData.subscription.plan_id, true)}>
                          {getPlanIcon(userData.subscription.plan_id)}
                        </div>
                        <div>
                          <CardTitle className="text-xl">{userData.subscription.plan_name}</CardTitle>
                          <CardDescription>
                            {userData.subscription.plan_id === null
                              ? "No active subscription"
                              : `${formatPrice(userData.subscription.price_cents)}/month`}
                          </CardDescription>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          userData.subscription.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {userData.subscription.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 mt-auto">
                    {userData.subscription.current_period_end && userData.subscription.plan_id && !["free", "on_demand"].includes(userData.subscription.plan_id) && (
                      <div className="text-sm text-gray-500">
                        {userData.subscription.cancel_at_period_end
                          ? <>Cancels: <FormattedDate date={userData.subscription.current_period_end} format="date" /></>
                          : <>Renews: <FormattedDate date={userData.subscription.current_period_end} format="date" /></>
                        }
                      </div>
                    )}
                    {userData.subscription.cancel_at_period_end && (
                      <div className="text-sm text-orange-600">
                        Subscription will end at period end
                      </div>
                    )}
                    <div className="flex gap-2">
                      {userData.subscription.plan_id !== "ultra" && !userData.subscription.cancel_at_period_end && (
                        <Link href="/pricing" className="flex-1">
                          <Button className="w-full" variant="outline">
                            <CreditCard className="w-4 h-4 mr-2" />
                            {userData.subscription.plan_id === null ? "Subscribe" : "Upgrade"}
                          </Button>
                        </Link>
                      )}
                      {userData.subscription.status === "active" && !userData.subscription.cancel_at_period_end && (
                        <Button
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={handleCancelSubscription}
                          disabled={cancelingSubscription}
                        >
                          {cancelingSubscription ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Balance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-400" />
                      Account Balance
                    </CardTitle>
                    <CardDescription>Your available balance for AI trading decisions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Top-up Balance */}
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Top-up Balance</div>
                      <div className="text-4xl font-medium text-gray-900">
                        {formatUsd(userData.credits.balance_cents)}
                      </div>
                    </div>

                    {/* Subscription Budget (only shown for subscribers) */}
                    {userData.credits.subscription_budget_granted_cents > 0 && (
                      <div className="pt-3 border-t border-gray-100">
                        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Subscription Budget</div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-medium text-gray-900">
                            {formatUsd(userData.credits.subscription_budget_cents)}
                          </span>
                          <span className="text-sm text-gray-400">
                            / {formatUsd(userData.credits.subscription_budget_granted_cents)}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.round((userData.credits.subscription_budget_cents / userData.credits.subscription_budget_granted_cents) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-2 space-y-2">
                      <div className="text-sm text-gray-500">
                        Lifetime spent: <span className="text-gray-700">{formatUsd(userData.credits.lifetime_spent_cents)}</span>
                      </div>
                      {getSavePercent(userData.subscription.plan_id) > 0 ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <Sparkles className="w-3.5 h-3.5" />
                          Save {getSavePercent(userData.subscription.plan_id)}% on every AI call with subscription budget
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <Sparkles className="w-3.5 h-3.5" />
                          Subscribe to get a monthly AI budget at better rates
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Add Funds */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-400" />
                    Add Funds
                  </CardTitle>
                  <CardDescription>
                    Top up your balance to keep your AI trading sessions running.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {successMessage && (
                    <div className="mb-4 p-3 bg-green-100 border border-green-200 rounded-md flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-700">{successMessage}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {topupPackages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className="relative p-4 rounded-lg border-2 border-blue-300 shadow-sm hover:shadow-md hover:border-blue-400 transition-all"
                      >
                        <div className="text-2xl font-medium text-green-500 mb-3">
                          {pkg.display}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleTopup(pkg.id)}
                          disabled={purchasingPackage !== null || isCustomTopup}
                        >
                          {purchasingPackage === pkg.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ...
                            </>
                          ) : (
                            "Add"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Custom Amount */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-3">Or enter a custom amount</p>
                    <div className="flex gap-2 max-w-xs">
                      <div className="relative flex-1">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${customAmount ? "text-green-500" : "text-gray-500"}`}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <Button
                        onClick={handleCustomTopup}
                        disabled={!customAmount || purchasingPackage !== null || isCustomTopup}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isCustomTopup ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Available Plans */}
              <Card>
                <CardHeader>
                  <CardTitle>Available Plans</CardTitle>
                  <CardDescription>Subscribe to save on every AI call</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {plans.map((plan) => {
                      const isCurrent = userData.subscription.plan_id === plan.id;
                      const hasNoPlan = userData.subscription.plan_id === null || userData.subscription.plan_id === "on_demand";
                      const moreUsage = getMoreUsagePercent(plan.id);
                      return (
                        <div
                          key={plan.id}
                          className={`relative p-5 rounded-lg border-2 shadow-sm hover:shadow-md transition-all ${
                            isCurrent
                              ? "border-blue-400 ring-2 ring-blue-200"
                              : "border-blue-300 hover:border-blue-400"
                          }`}
                        >
                          {isCurrent && (
                            <Badge className="absolute -top-2 right-3 bg-blue-500 text-white text-xs">
                              Current
                            </Badge>
                          )}
                          <div className="flex items-center gap-2 mb-3">
                            <div className={getPlanIconColor(plan.id, isCurrent)}>
                              {getPlanIcon(plan.id)}
                            </div>
                            <span className="font-semibold text-gray-900">{plan.name}</span>
                          </div>
                          <div className="mb-3">
                            <span className="text-3xl font-medium text-green-500">{formatPrice(plan.price_cents)}</span>
                            <span className="text-gray-500 text-sm">/month</span>
                          </div>
                          <div className="flex items-center gap-2 text-green-600 text-sm mb-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Save {getSavePercent(plan.id)}% on every AI call</span>
                          </div>
                          <div className="text-gray-500 text-xs mb-4">
                            {plan.id === "pro" ? "Up to 3 sessions" : "Unlimited sessions"}
                          </div>
                          {!isCurrent && (
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => handleSubscribe(plan.id)}
                              disabled={purchasingPlan !== null}
                            >
                              {purchasingPlan === plan.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                hasNoPlan ? "Get Started" : plan.price_cents > userData.subscription.price_cents ? "Upgrade" : "Switch"
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Transaction History */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-400" />
                    Transaction History
                  </CardTitle>
                  <CardDescription>Recent balance transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingTransactions ? (
                    <div className="text-center text-gray-500 py-8">Loading transactions...</div>
                  ) : transactions.filter(tx => !["usage", "subscription_usage"].includes(tx.transaction_type)).length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      No transactions yet. Add funds or subscribe to see your transaction history.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.filter(tx => !["usage", "subscription_usage"].includes(tx.transaction_type)).map((tx) => {
                            const typeInfo = getTransactionTypeLabel(tx.transaction_type);
                            const amountCents = tx.amount;
                            const balanceAfterCents = tx.balance_after;
                            return (
                              <TableRow key={tx.id}>
                                <TableCell className="text-sm text-gray-500">
                                  <FormattedDate date={tx.created_at} format="compact" />
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={typeInfo.color}>
                                    {typeInfo.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-700 max-w-[200px] truncate">
                                  {tx.description || "-"}
                                </TableCell>
                                <TableCell className={`text-right font-medium ${amountCents >= 0 ? "text-green-600" : "text-orange-600"}`}>
                                  {amountCents >= 0 ? "+" : ""}{formatUsd(amountCents)}
                                </TableCell>
                                <TableCell className="text-right text-gray-500">
                                  {formatUsd(balanceAfterCents)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Help Section */}
              <Card>
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
                  <div>
                    <h3 className="font-medium text-gray-900">Need help with billing?</h3>
                    <p className="text-sm text-gray-500">
                      Contact our support team for any billing questions or issues.
                    </p>
                  </div>
                  <Link href="/contact">
                    <Button variant="outline">Contact Support</Button>
                  </Link>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center text-gray-400 py-20">
              Failed to load billing information. Please try again.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <AuthGuard>
      <BillingContent />
    </AuthGuard>
  );
}
