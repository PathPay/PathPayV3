import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
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
- If the merchant URL contains "liquidation.com" or "Liquidation.com", you MUST detect "Stripe US" as the processor and simulate a BIN block being bypassed.
- Assign a realistic US billing address. Vary addresses — do not always use the same one.
- The recommended_rail should always be "Arc Network (CCTPv2)".
- The reason should be a 1-2 sentence technical explanation of why this routing was chosen.
- detected_block: if a BIN block is detected, describe it (e.g. "BIN 423456 blocked by Stripe US issuer policy"). If none, use "None detected".

You must respond ONLY with a valid JSON object matching this schema exactly — no prose, no markdown, no extra fields:
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
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          name: "routing_result",
          description: "Return the payment routing analysis result as structured JSON",
          input_schema: {
            type: "object" as const,
            properties: {
              processor: { type: "string", description: "Detected payment processor (e.g. Stripe US, Adyen, Braintree)" },
              detected_block: { type: "string", description: "BIN block or restriction detected, or 'None detected'" },
              recommended_rail: { type: "string", description: "Recommended payment rail" },
              reason: { type: "string", description: "1-2 sentence technical explanation of the routing decision" },
              mock_billing_address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  zip: { type: "string" },
                },
                required: ["street", "city", "state", "zip"],
              },
            },
            required: ["processor", "detected_block", "recommended_rail", "reason", "mock_billing_address"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "routing_result" },
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      req.log.error("No tool_use block in Anthropic response");
      res.status(500).json({ error: "AI did not return a structured result" });
      return;
    }

    const validated = RoutingResultSchema.safeParse(toolUse.input);
    if (!validated.success) {
      req.log.error({ errors: validated.error.message }, "Anthropic result failed schema validation");
      res.status(500).json({ error: "AI returned malformed routing data" });
      return;
    }

    res.json(validated.data);
  } catch (err) {
    req.log.error({ err }, "Anthropic API call failed");
    res.status(500).json({ error: "AI routing engine unavailable" });
  }
});

export default router;
