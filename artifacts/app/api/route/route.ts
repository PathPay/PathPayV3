import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { merchantUrl, amount, userCountry } = await req.json();

  const systemPrompt = `You are PathPay's payment routing intelligence.

Your job: analyze a merchant URL and determine if the user needs a real Mastercard virtual card (via Immersve) funded by on-chain USDC, or can pay directly with stablecoin.

Rules:
- Almost all physical goods merchants (Apple, Amazon, Liquidation.com, Shopify stores, electronics) = immersve_card
- Crypto-native merchants (Gitcoin, ENS, DAOs, crypto SaaS) = stablecoin_direct
- Traditional SaaS (Vercel, Figma, Notion, AWS) = immersve_card
- When in doubt = immersve_card

Immersve issues real Mastercard cards with non-crypto BINs funded by USDC on Mantle. These pass merchant BIN checks that reject crypto cards.

Respond ONLY with valid JSON. No markdown. No explanation outside JSON.

Schema:
{
  "recommended_rail": "immersve_card" | "stablecoin_direct",
  "reason": "string (one sentence, specific to this merchant)",
  "confidence": 0.0-1.0,
  "merchant_category": "physical_goods" | "saas" | "crypto_native" | "marketplace",
  "bin_risk": "high" | "medium" | "low",
  "bin_risk_reason": "string (why this merchant blocks certain BINs)",
  "immersve_card_type": "single_use" | "subscription" | null,
  "usdc_amount_needed": "string",
  "fallback_rail": "stablecoin_direct" | "p2p_corridor" | null
}`;

  const userMessage = `Merchant URL: ${merchantUrl}
Amount: ${amount} USDC
User country: ${userCountry || "NG"}`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pathpay.app",
      },
      body: JSON.stringify({
        model: "anthropic/claude-4.5-haiku",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.1,
      }),
    },
  );

  if (!response.ok) {
    return NextResponse.json({ error: "AI routing failed" }, { status: 500 });
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);

    // If immersve_card, call Immersve sandbox to issue a real card
    if (parsed.recommended_rail === "immersve_card") {
      const cardResult = await issueImmersveCard(amount);
      return NextResponse.json({ ...parsed, card: cardResult });
    }

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}

async function issueImmersveCard(amount: string) {
  const IMMERSVE_API_KEY = process.env.IMMERSVE_API_KEY;
  const IMMERSVE_ACCOUNT_ID = process.env.IMMERSVE_ACCOUNT_ID;

  if (!IMMERSVE_API_KEY || !IMMERSVE_ACCOUNT_ID) {
    // Sandbox fallback until you have credentials
    return {
      status: "sandbox_pending",
      message:
        "Add IMMERSVE_API_KEY and IMMERSVE_ACCOUNT_ID to env to issue real cards",
      sandbox_card: {
        number: "5204 7410 0001 0014",
        expiry: "12/27",
        cvv: "100",
        network: "Mastercard",
        bin_country: "US",
        funded_by: "USDC on Mantle",
      },
    };
  }

  try {
    // Real Immersve card issuance
    // Docs: https://docs.immersve.com
    const response = await fetch(
      "https://api.immersve.com/api/card-applications",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${IMMERSVE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: IMMERSVE_ACCOUNT_ID,
          fundingAmountCents: Math.round(parseFloat(amount) * 100),
          fundingCurrency: "USDC",
          cardProgramId: process.env.IMMERSVE_CARD_PROGRAM_ID,
          region: "us",
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      return { status: "error", message: err };
    }

    const cardData = await response.json();
    return {
      status: "issued",
      card_application_id: cardData.id,
      network: "Mastercard",
      bin_country: "US",
      funded_by: "USDC on Mantle",
      // Pan/CVV retrieved separately via GET /card-applications/:id/pan after KYC
      next_step:
        "Fund the card on Mantle then call /pan endpoint to reveal card details",
    };
  } catch (e: any) {
    return { status: "error", message: e.message };
  }
}
