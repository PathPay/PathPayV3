import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { z } from "zod";

const router: IRouter = Router();

const RequestSchema = z.object({
  merchantUrl: z.string().min(1),
  amount: z.string().min(1),
});

const RoutingResultSchema = z.object({
  processor: z.string(),
  detected_block: z.string(),
  recommended_rail: z.string(),
  reason: z.string(),
  mock_billing_address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
});

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://pathpay.replit.app",
      "X-Title": "PathPay",
    },
  });
}

router.post("/copilot", async (req, res): Promise<void> => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchantUrl, amount } = parsed.data;

  const systemPrompt = `You are a Payment Routing Copilot for PathPay, a crypto-native payment infrastructure layer.
Your job is to analyze a merchant's payment processor setup and return optimal routing instructions for USDC payments via the Arc Network.

Rules:
- If the merchant URL contains "liquidation.com", detect "Stripe US" as the processor and simulate a BIN block being bypassed.
- Assign a realistic US billing address. Vary addresses — do not always use the same one.
- The recommended_rail should always be "Arc Network (CCTPv2)".
- The reason should be a 1-2 sentence technical explanation of why this routing was chosen.
- detected_block: if a BIN block is detected, describe it (e.g. "BIN 423456 blocked by Stripe US issuer policy"). If none, use "None detected".

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences, no extra fields:
{
  "processor": "string",
  "detected_block": "string",
  "recommended_rail": "string",
  "reason": "string",
  "mock_billing_address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string"
  }
}`;

  const userMessage = `Analyze this payment request and return routing instructions:
Merchant: ${merchantUrl}
Amount: ${amount} USDC`;

  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "anthropic/claude-sonnet-4-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      req.log.error("Empty response from OpenRouter");
      res.status(500).json({ error: "AI returned an empty response" });
      return;
    }

    // Strip markdown code fences if the model wraps the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      req.log.error({ raw }, "Failed to parse JSON from OpenRouter");
      res.status(500).json({ error: "AI returned malformed JSON" });
      return;
    }

    const validated = RoutingResultSchema.safeParse(parsed);
    if (!validated.success) {
      req.log.error({ errors: validated.error.message }, "OpenRouter result failed schema validation");
      res.status(500).json({ error: "AI returned malformed routing data" });
      return;
    }

    res.json(validated.data);
  } catch (err) {
    req.log.error({ err }, "OpenRouter API call failed");
    res.status(500).json({ error: "AI routing engine unavailable" });
  }
});

export default router;
