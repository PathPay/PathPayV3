import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseUnits } from "viem";
import { PrivyClient } from "@privy-io/server-auth";

const privyClient = new PrivyClient(
  process.env.PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function POST(req: NextRequest) {
  const { privyToken, toAddress, amount, rail } = await req.json();

  // Verify user via Privy server-side
  let userId: string;
  try {
    const verifiedClaims = await privyClient.verifyAuthToken(privyToken);
    userId = verifiedClaims.userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (rail !== "stablecoin_direct") {
    // For non-stablecoin rails, return virtual card details (mock for now,
    // replace with real Stripe Issuing / Lithic API calls)
    return NextResponse.json({
      rail,
      status: "card_generated",
      card: {
        number: `4242 4242 4242 ${Math.floor(1000 + Math.random() * 9000)}`,
        expiry: "12/27",
        cvv: `${Math.floor(100 + Math.random() * 900)}`,
        billing_name: "USER 1",
      },
      note: "Replace with real Stripe Issuing API in production",
    });
  }

  // Stablecoin direct — return unsigned tx for client to sign via Privy
  return NextResponse.json({
    rail: "stablecoin_direct",
    status: "ready_to_sign",
    tx: {
      to: toAddress as `0x${string}`,
      value: parseUnits(amount, 6).toString(), // USDC is 6 decimals
      chainId: 5003,
    },
    userId,
  });
}
