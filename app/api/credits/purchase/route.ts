import { NextRequest, NextResponse } from "next/server";
import { stripe, getBaseUrl } from "@/lib/stripe/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export const dynamic = 'force-dynamic';

/**
 * On-demand balance top-up packages
 * Users add USD to their balance which they use for AI trading.
 * Subscribers get better rates (more AI usage per dollar).
 */
const TOPUP_PACKAGES = [
  {
    id: 'topup_5',
    amount_cents: 500,     // $5.00
    display: '$5',
    popular: false,
  },
  {
    id: 'topup_10',
    amount_cents: 1000,    // $10.00
    display: '$10',
    popular: false,
  },
  {
    id: 'topup_25',
    amount_cents: 2500,    // $25.00
    display: '$25',
    popular: true,
  },
  {
    id: 'topup_50',
    amount_cents: 5000,    // $50.00
    display: '$50',
    popular: false,
  },
  {
    id: 'topup_100',
    amount_cents: 10000,   // $100.00
    display: '$100',
    popular: false,
  },
] as const;

/**
 * POST /api/credits/purchase
 * Create a Stripe checkout session for balance top-up
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { package_id, custom_amount_cents } = body;

    let amountCents: number;
    let displayAmount: string;
    let packageId: string;

    // Handle custom amount
    if (custom_amount_cents) {
      amountCents = Math.round(custom_amount_cents);

      if (amountCents <= 0) {
        return NextResponse.json(
          { error: "Amount must be greater than 0" },
          { status: 400 }
        );
      }

      displayAmount = `$${(amountCents / 100).toFixed(2)}`;
      packageId = `custom_${amountCents}`;
    }
    // Handle preset package
    else if (package_id) {
      const topupPackage = TOPUP_PACKAGES.find(p => p.id === package_id);
      if (!topupPackage) {
        return NextResponse.json(
          { error: "Invalid package_id" },
          { status: 400 }
        );
      }
      amountCents = topupPackage.amount_cents;
      displayAmount = topupPackage.display;
      packageId = package_id;
    }
    // Neither provided
    else {
      return NextResponse.json(
        { error: "package_id or custom_amount_cents is required" },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl();

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Add ${displayAmount} to Balance`,
              description: `Top up your AI trading balance with ${displayAmount}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        package_id: packageId,
        amount_cents: amountCents.toString(),
        type: 'topup',
      },
      success_url: `${baseUrl}/settings/billing?success=topup&amount=${amountCents}`,
      cancel_url: `${baseUrl}/settings/billing?canceled=true`,
      customer_email: user.email || undefined,
    });

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error: any) {
    console.error("[POST /api/credits/purchase] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/credits/purchase
 * Get available top-up packages
 */
export async function GET() {
  return NextResponse.json({
    packages: TOPUP_PACKAGES.map(pkg => ({
      id: pkg.id,
      amount_cents: pkg.amount_cents,
      display: pkg.display,
      popular: pkg.popular,
      // Legacy fields for backwards compatibility
      amount_usd: (pkg.amount_cents / 100).toFixed(2),
      price_display: pkg.display,
      credits: pkg.amount_cents, // 1 credit = 1 cent
      price_cents: pkg.amount_cents,
    })),
  });
}
