export type ImmersveCard = {
  status: 'sandbox_pending' | 'issued' | 'error';
  sandbox_card?: {
    number: string;
    expiry: string;
    cvv: string;
    network: string;
    bin_country: string;
    funded_by: string;
  };
  card_application_id?: string;
  message?: string;
};

export type RoutingDecision = {
  recommended_rail: 'immersve_card' | 'stablecoin_direct' | 'p2p_corridor';
  processor: string;
  reason: string;
  confidence: number;
  merchant_accepts_crypto: boolean;
  merchant_category: 'physical_goods' | 'saas' | 'crypto_native' | 'marketplace';
  bin_risk: 'high' | 'medium' | 'low';
  bin_risk_reason: string;
  suggested_stablecoin: 'USDC' | 'USDT' | 'DAI' | null;
  fallback_rails: string[];
  card?: ImmersveCard;
  routing_id?: string;
};

export async function getRoutingDecision(
  merchantUrl: string,
  amount: string,
  userCountry: string = 'NG',
  authToken: string | null = null
): Promise<RoutingDecision> {
  const res = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantUrl, amount, userCountry, authToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Routing failed');
  }
  return res.json();
}