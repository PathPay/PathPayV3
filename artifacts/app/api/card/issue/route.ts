import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import {
  createCardholder,
  createFundingSource,
  getFundingIntent,
  issueVirtualCard,
  revealCardDetails,
} from "../../../../lib/immersve";
import { supabaseAdmin } from "../../../../lib/supabase";

const privyClient = new PrivyClient(
  process.env.PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function POST(req: NextRequest) {
  const { privyToken, merchantUrl, amountUsdc, action } = await req.json();

  // Auth
  let claims: any;
  try {
    claims = await privyClient.verifyAuthToken(privyToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = claims;

  // Get or create user record in Supabase
  let { data: user } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("privy_id", userId)
    .single();

  if (!user) {
    return NextResponse.json(
      { error: "User not found. Complete onboarding first." },
      { status: 404 },
    );
  }

  // ACTION: setup — create cardholder + funding source (run once per user)
  if (action === "setup") {
    const cardholder = await createCardholder({
      email: user.email,
      firstName: user.first_name || "PathPay",
      lastName: user.last_name || "User",
      walletAddress: user.wallet_address,
    });

    const fundingSource = await createFundingSource(
      cardholder.id,
      user.wallet_address,
    );

    // Save to Supabase
    await supabaseAdmin
      .from("users")
      .update({
        immersve_cardholder_id: cardholder.id,
        immersve_funding_source_id: fundingSource.fundingSourceId,
      })
      .eq("privy_id", userId);

    return NextResponse.json({
      cardholderId: cardholder.id,
      fundingSourceId: fundingSource.fundingSourceId,
    });
  }

  // ACTION: fund — get deposit address to send USDC to
  if (action === "fund") {
    if (!user.immersve_funding_source_id) {
      return NextResponse.json({ error: "Run setup first" }, { status: 400 });
    }
    const intent = await getFundingIntent(
      user.immersve_funding_source_id,
      amountUsdc,
    );
    return NextResponse.json(intent);
    // Returns: { depositAddress: '0x...', amount: '50000000', expiresAt: '...' }
    // Frontend sends USDC to depositAddress on Mantle via Privy wallet
  }

  // ACTION: issue — issue virtual card (after USDC confirmed on-chain)
  if (action === "issue") {
    if (!user.immersve_cardholder_id || !user.immersve_funding_source_id) {
      return NextResponse.json({ error: "Run setup first" }, { status: 400 });
    }

    const card = await issueVirtualCard(
      user.immersve_cardholder_id,
      user.immersve_funding_source_id,
      amountUsdc,
      merchantUrl,
    );

    const cardDetails = await revealCardDetails(card.cardId);

    // Log payment attempt
    await supabaseAdmin.from("payment_attempts").insert({
      user_id: user.id,
      merchant_url: merchantUrl,
      amount_usdc: amountUsdc,
      recommended_rail: "immersve_virtual_card",
      status: "card_issued",
    });

    return NextResponse.json({
      card: {
        number: cardDetails.cardNumber,
        expiry: `${cardDetails.expiryMonth}/${cardDetails.expiryYear}`,
        cvv: cardDetails.cvv,
        type: "Mastercard",
        billingName:
          `${user.first_name || "PATHPAY"} ${user.last_name || "USER"}`.toUpperCase(),
      },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
