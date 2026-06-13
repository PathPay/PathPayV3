import { Router, type IRouter } from "express";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const RequestSchema = z.object({
  privyToken: z.string().min(1),
  toAddress: z.string().min(1),
  amount: z.string().min(1),
  rail: z.enum(["stablecoin_direct", "virtual_card_stripe", "virtual_card_lithic", "p2p_corridor"]),
  routingId: z.string().uuid().optional(),
  merchantUrl: z.string().optional(),
});

function getPrivyClient() {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error("Privy credentials not configured");
  return new PrivyClient(appId, secret);
}

router.post("/execute-payment", async (req, res): Promise<void> => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { privyToken, toAddress, amount, rail, routingId, merchantUrl } = parsed.data;

  let userId: string;
  try {
    const privyClient = getPrivyClient();
    const verifiedClaims = await privyClient.verifyAuthToken(privyToken);
    userId = verifiedClaims.userId;
  } catch (err) {
    req.log.warn({ err }, "Privy token verification failed");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let responseBody: Record<string, unknown>;

  if (rail !== "stablecoin_direct") {
    const lastFour = Math.floor(1000 + Math.random() * 9000);
    responseBody = {
      rail,
      status: "card_generated",
      userId,
      card: {
        number: `4242 4242 4242 ${lastFour}`,
        expiry: "12/27",
        cvv: `${Math.floor(100 + Math.random() * 900)}`,
        billing_name: "PATHPAY USER",
      },
    };
  } else {
    responseBody = {
      rail: "stablecoin_direct",
      status: "ready_to_sign",
      userId,
      tx: {
        to: toAddress,
        chainId: 5003,
        note: "Client signs via Privy embedded wallet on Mantle Sepolia",
      },
    };
  }

  // Persist payment event (best-effort)
  try {
    const card = responseBody.card as { number?: string } | undefined;
    const cardLast4 = card?.number?.slice(-4) ?? null;

    await supabaseAdmin.from("payment_events").insert({
      user_id: userId,
      routing_id: routingId ?? null,
      rail,
      amount,
      merchant_url: merchantUrl ?? null,
      status: responseBody.status as string,
      tx_hash: null,
      card_last4: cardLast4,
    });
  } catch (err) {
    req.log.warn({ err }, "Payment event persistence error (non-fatal)");
  }

  res.json(responseBody);
});

export default router;
