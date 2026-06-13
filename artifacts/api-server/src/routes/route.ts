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

const systemPrompt = `You are PathPay's payment routing intelligence. Analyze merchants and return optimal payment rails for emerging market users facing BIN filtering.

Rails: stablecoin_direct (Mantle USDC), virtual_card_stripe (US BIN), virtual_card_lithic (alt BIN), p2p_corridor (local rails).

Decision factors:
- Does merchant accept crypto natively? → stablecoin_direct
- Is merchant US-based SaaS/digital? → virtual_card_stripe
- Does merchant reject Stripe BINs? → virtual_card_lithic
- Is merchant local/cash-heavy economy? → p2p_corridor

Respond ONLY with valid JSON. No markdown. No explanation.

JSON schema:
{
  "recommended_rail": "stablecoin_direct" | "virtual_card_stripe" | "virtual_card_lithic" | "p2p_corridor",
  "processor": "string (company name)",
  "reason": "string (1-2 sentences explaining why this rail)",
  "confidence": 0.0-1.0,
  "merchant_accepts_crypto": boolean,
  "suggested_stablecoin": "USDC" | "USDT" | "DAI" | null,
  "virtual_card_bin_region": "US" | "UK" | "EU" | null,
  "mock_billing_address": { "street": "string", "city": "string", "state": "string", "zip": "string", "country": "string" } | null,
  "fallback_rails": ["string"]
}`;

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
User's country: ${userCountry}

Analyze this merchant and return the optimal payment routing decision.`;

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
        max_tokens: 600,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      req.log.error({ status: response.status }, "OpenRouter routing request failed");
      res.status(500).json({ error: "AI routing failed" });
      return;
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      routingResult = JSON.parse(cleaned);
    } catch {
      req.log.error({ content }, "Failed to parse routing JSON");
      res.status(500).json({ error: "Invalid AI response" });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "Routing engine error");
    res.status(500).json({ error: "Routing engine unavailable" });
    return;
  }

  // Persist routing history (best-effort, non-blocking)
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
        billing_address: routingResult.mock_billing_address ?? null,
        fallback_rails: routingResult.fallback_rails ?? [],
      })
      .select("id")
      .single();

    if (insertError) {
      req.log.warn({ insertError }, "Failed to persist routing history");
    } else {
      routingId = row?.id;
    }
  } catch (err) {
    req.log.warn({ err }, "Routing history persistence error (non-fatal)");
  }

  res.json({ ...routingResult, routing_id: routingId });
});

export default router;
