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

export type RoutingDecisionWithId = RoutingDecision & {
  routing_id?: string;
};

export async function getRoutingDecision(
  merchantUrl: string,
  amount: string,
  userCountry: string = "NG",
  authToken?: string | null,
): Promise<RoutingDecisionWithId> {
  const response = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantUrl, amount, userCountry, authToken }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Routing engine failed" }));
    throw new Error((err as { error?: string }).error ?? "Routing engine failed");
  }

  const data = await response.json();
  const { routing_id, ...rest } = data as RoutingDecisionWithId;
  const validated = RoutingDecisionSchema.parse(rest);
  return { ...validated, routing_id };
}
