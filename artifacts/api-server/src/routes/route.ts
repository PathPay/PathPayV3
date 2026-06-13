import { Router, type IRouter } from "express";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const RequestSchema = z.object({
  merchantUrl: z.string().min(1),
  amount: z.string().min(1),
  userCountry: z.string().default("NG"),
  authToken: z.string().optional(),
});

const systemPrompt = `You are PathPay's payment routing intelligence for emerging market users (Nigeria, LATAM, Southeast Asia) who face BIN filtering and card discrimination.

Available rails:
- immersve_card: Real Mastercard virtual card issued via Immersve, funded by USDC on Mantle. Card has a non-crypto US BIN that passes merchant BIN checks. Use for ANY merchant that doesn't natively accept crypto.
- stablecoin_direct: Direct USDC payment on Mantle Network. Only use if the merchant explicitly accepts crypto payments (DAOs, Gitcoin, ENS, crypto-native tools).
- p2p_corridor: Local payment corridors. Only use for local African/LATAM merchants with no card infrastructure.

Rules:
- Apple.com, Amazon, Liquidation.com, Shopify stores, electronics = immersve_card (high bin_risk)
- Vercel, Figma, Notion, AWS, GitHub = immersve_card (medium bin_risk, traditional SaaS blocks crypto BINs)
- Gitcoin, ENS, Mirror, DAO tools = stablecoin_direct
- Local Nigerian/LATAM merchants = p2p_corridor
- Default to immersve_card when uncertain

Respond ONLY with valid JSON. No markdown. No explanation outside JSON.

Schema:
{
  "recommended_rail": "immersve_card" | "stablecoin_direct" | "p2p_corridor",
  "processor": "string",
  "reason": "string (one sentence, merchant-specific)",
  "confidence": 0.0-1.0,
  "merchant_accepts_crypto": boolean,
  "merchant_category": "physical_goods" | "saas" | "crypto_native" | "marketplace",
  "bin_risk": "high" | "medium" | "low",
  "bin_risk_reason": "string (why this merchant blocks certain BINs)",
  "suggested_stablecoin": "USDC" | "USDT" | "DAI" | null,
  "fallback_rails": ["string"]
}`;

async function issueImmersveCard(amount: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.IMMERSVE_API_KEY;
  const accountId = process.env.IMMERSVE_ACCOUNT_ID;
  const cardProgramId = process.env.IMMERSVE_CARD_PROGRAM_ID;

  if (!apiKey || !accountId || !cardProgramId) {
    return {
      status: "sandbox_pending",
      message: "Add IMMERSVE_API_KEY, IMMERSVE_ACCOUNT_ID, IMMERSVE_CARD_PROGRAM_ID to env",
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

  const response = await fetch("https://api.immersve.com/api/card-applications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId,
      fundingAmountCents: Math.round(parseFloat(amount) * 100),
      fundingCurrency: "USDC",
      cardProgramId,
      region: "us",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return { status: "error", message: err };
  }

  const cardData = await response.json() as { id?: string };
  return {
    status: "issued",
    card_application_id: cardData.id,
    network: "Mastercard",
    bin_country: "US",
    funded_by: "USDC on Mantle",
    next_step: "Fund on Mantle then call /pan to reveal card details",
  };
}

function getPrivyClient() {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) return null;
  return new PrivyClient(appId, secret);
}

router.post("/route", async (req, res): Promise<void> => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchantUrl, amount, userCountry, authToken } = parsed.data;

  const userMessage = `Merchant URL: ${merchantUrl}
Payment amount: ${amount} USDC
User country: ${userCountry}`;

  let routingResult: Record<string, unknown>;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pathpay.app",
        "X-Title": "PathPay",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-haiku",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      res.status(500).json({ error: "AI routing failed" });
      return;
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      routingResult = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Invalid AI response" });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "Routing engine error");
    res.status(500).json({ error: "Routing engine unavailable" });
    return;
  }

  // Issue real Immersve card if that rail was selected
  if (routingResult.recommended_rail === "immersve_card") {
    try {
      const card = await issueImmersveCard(amount);
      routingResult.card = card;
    } catch (err) {
      req.log.warn({ err }, "Immersve card issuance failed (non-fatal)");
    }
  }

  // Persist routing history
  let routingId: string | undefined;
  try {
    let userId: string | undefined;
    if (authToken) {
      const privyClient = getPrivyClient();
      if (privyClient) {
        const claims = await privyClient.verifyAuthToken(authToken).catch(() => null);
        if (claims) userId = claims.userId;
      }
    }

    const { data: row, error: insertError } = await supabaseAdmin
      .from("routing_history")
      .insert({
        user_id: userId ?? null,
        merchant_url: merchantUrl,
        amount,
        recommended_rail: routingResult.recommended_rail,
        processor: routingResult.processor,
        confidence: routingResult.confidence,
        reason: routingResult.reason,
        billing_address: null,
        fallback_rails: routingResult.fallback_rails ?? [],
      })
      .select("id")
      .single();

    if (!insertError) routingId = row?.id;
  } catch (err) {
    req.log.warn({ err }, "Routing history persistence error (non-fatal)");
  }

  res.json({ ...routingResult, routing_id: routingId });
});

export default router;