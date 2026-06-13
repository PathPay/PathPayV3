import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

const RequestSchema = z.object({
  message: z.string().min(1),
  walletAddress: z.string().optional(),
});

const systemPrompt = `You are PathPay's SaaS payment agent. Users ask you to pay for subscriptions and SaaS services.

Extract payment intent and respond with a JSON object:
{
  "merchant": "string",
  "amount_usdc": "string",
  "recommended_rail": "stablecoin_direct" | "virtual_card_stripe",
  "contract_address": "0x...",
  "response_message": "string (short conversational response, 1-2 sentences)"
}

For SaaS tools that accept crypto (Gitcoin, ENS, Mirror, etc) use stablecoin_direct.
For traditional SaaS (Vercel, Figma, Notion, GitHub, etc) use virtual_card_stripe.
For contract_address, use the merchant's known USDC receiving address if known, otherwise use 0x000000000000000000000000000000000000dEaD as a testnet placeholder.

Respond ONLY with JSON. No markdown.`;

router.post("/agent", async (req, res): Promise<void> => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, walletAddress } = parsed.data;

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
          {
            role: "user",
            content: walletAddress
              ? `${message}\n\nUser wallet: ${walletAddress}`
              : message,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const intent = JSON.parse(cleaned);
      res.json({
        response: intent.response_message || "Payment request processed.",
        intent,
      });
    } catch {
      req.log.error({ content }, "Failed to parse agent JSON");
      res.json({ response: "Unable to process payment request.", intent: null });
    }
  } catch (err) {
    req.log.error({ err }, "Agent API call failed");
    res.json({ response: "Payment agent unavailable.", intent: null });
  }
});

export default router;
