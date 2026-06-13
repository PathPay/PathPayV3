import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { message, walletAddress } = await req.json();

  const systemPrompt = `You are PathPay's SaaS payment agent. Users ask you to pay for subscriptions and SaaS services.

Extract payment intent and respond with a JSON object:
{
  "merchant": "string",
  "amount_usdc": "string",  
  "recommended_rail": "stablecoin_direct" | "virtual_card_stripe",
  "contract_address": "0x...",
  "response_message": "string (conversational response to user)"
}

For contract_address, use the merchant's known USDC receiving address if known, otherwise generate a plausible 0x address.
For SaaS tools that accept crypto (Gitcoin, ENS, etc) use stablecoin_direct. For traditional SaaS (Vercel, Figma, Notion) use virtual_card_stripe.

Respond ONLY with JSON. No markdown.`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-haiku",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.1,
      }),
    },
  );

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);
    return NextResponse.json({
      response: parsed.response_message,
      intent: parsed,
    });
  } catch {
    return NextResponse.json({
      response: "Unable to process payment request.",
      intent: null,
    });
  }
}
