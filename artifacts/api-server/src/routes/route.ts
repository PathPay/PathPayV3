import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

const RequestSchema = z.object({
  merchantUrl: z.string().min(1),
  amount: z.string().min(1),
  userCountry: z.string().default("NG"),
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

router.post("/route", async (req, res): Promise<void> => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchantUrl, amount, userCountry } = parsed.data;

  const userMessage = `Merchant URL: ${merchantUrl}
Payment amount: ${amount} USDC
User's country: ${userCountry}

Analyze this merchant and return the optimal payment routing decision.`;

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
      const result = JSON.parse(cleaned);
      res.json(result);
    } catch {
      req.log.error({ content }, "Failed to parse routing JSON");
      res.status(500).json({ error: "Invalid AI response" });
    }
  } catch (err) {
    req.log.error({ err }, "Routing engine error");
    res.status(500).json({ error: "Routing engine unavailable" });
  }
});

export default router;
