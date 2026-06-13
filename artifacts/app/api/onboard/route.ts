import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { supabaseAdmin } from "../../../lib/supabase";

const privyClient = new PrivyClient(
  process.env.PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function POST(req: NextRequest) {
  const { privyToken, walletAddress, email } = await req.json();

  let claims: any;
  try {
    claims = await privyClient.verifyAuthToken(privyToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("privy_id", claims.userId)
    .single();

  if (!existing) {
    await supabaseAdmin.from("users").insert({
      privy_id: claims.userId,
      wallet_address: walletAddress,
      email,
    });
  }

  return NextResponse.json({ ok: true });
}
