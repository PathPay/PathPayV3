import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { merchantUrl, amount, userCountry } = await req.json();

  const systemPrompt = `You are PathPay's payment routing intelligence. Analyze merchants and return optimal payment rails for emerging market users facing BIN filtering.

Rails: stablecoin_direct (Mantle USDC), virtual_card_stripe (US BIN), virtual_card_lithic (alt BIN), p2p_corridor (local rails).

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
  "mock_billing_address": {
    "street": "string",
    "city": "string", 
    "state": "string",
    "zip": "string",
    "country": "string"
  } | null,
  "fallback_rails": ["string"]
}`;

  const userMessage = `Merchant URL: ${merchantUrl}
Payment amount: ${amount} USDC
User's country: ${userCountry}

Analyze this merchant and return the optimal payment routing decision.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pathpay.app',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-haiku',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'AI routing failed' }, { status: 500 });
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 });
  }
}