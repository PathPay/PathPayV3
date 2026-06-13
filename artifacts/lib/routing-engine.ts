import { z } from "zod";

export const RoutingDecisionSchema = z.object({
  recommended_rail: z.enum([
    "stablecoin_direct",
    "virtual_card_stripe",
    "virtual_card_lithic",
    "p2p_corridor",
  ]),
  processor: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  merchant_accepts_crypto: z.boolean(),
  suggested_stablecoin: z.enum(["USDC", "USDT", "DAI"]).nullable(),
  virtual_card_bin_region: z.string().nullable(),
  mock_billing_address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string(),
    })
    .nullable(),
  fallback_rails: z.array(z.string()),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const ROUTING_SYSTEM_PROMPT = `You are PathPay's payment routing intelligence. Your job is to analyze a merchant and determine the optimal payment rail for users in emerging markets (Nigeria, LATAM, Southeast Asia) who face BIN filtering and card discrimination.

Payment rails available:
1. stablecoin_direct — Direct USDC/USDT payment via Mantle Network (best for crypto-native merchants, DAOs, SaaS with crypto billing)
2. virtual_card_stripe — Stripe Issuing virtual card with US BIN (best for US merchants, Shopify stores, subscription SaaS)
3. virtual_card_lithic — Lithic virtual card (best for merchants that reject Stripe BINs, fintech-savvy merchants)
4. p2p_corridor — P2P payment corridor via local rails (best for local merchants, cash-heavy economies)

Decision factors:
- Does merchant accept crypto natively? Check domain/product type
- Is merchant US-based? Stripe Issuing US BIN works best
- Is merchant geo-blocking certain countries? Use virtual card with US billing address
- Is this a SaaS/digital product? Prefer stablecoin if possible, else Stripe
- Is this physical goods? Virtual card required

Always respond ONLY with valid JSON matching the schema. No markdown, no explanation outside JSON.`;

export async function getRoutingDecision(
  merchantUrl: string,
  amount: string,
  userCountry: string = "NG",
): Promise<RoutingDecision> {
  const response = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantUrl, amount, userCountry }),
  });

  if (!response.ok) throw new Error("Routing engine failed");
  const data = await response.json();
  return RoutingDecisionSchema.parse(data);
}
