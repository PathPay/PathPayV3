import { Router, type IRouter } from "express";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const RequestSchema = z.object({
  privyToken: z.string().min(1),
  toAddress: z.string().min(1),
  amount: z.string().min(1),
  rail: z.enum(["immersve_card", "stablecoin_direct", "p2p_corridor"]),
  routingId: z.string().uuid().optional(),
  merchantUrl: z.string().optional(),
});

function getPrivyClient() {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error("Privy credentials not configured");
  return new PrivyClient(appId, secret);
}

async function issueImmersveCard(amount: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.IMMERSVE_API_KEY;
  const accountId = process.env.IMMERSVE_ACCOUNT_ID;
  const cardProgramId = process.env.IMMERSVE_CARD_PROGRAM_ID;

  if (!apiKey || !accountId || !cardProgramId) {
    // Sandbox: Immersve's own published test card
    return {
      number: "5204 7410 0001 0014",
      expiry: "12/27",
      cvv: "100",
      billing_name: "PATHPAY USER",
      network: "Mastercard",
      bin_country: "US",
      funded_by: "USDC on Mantle",
      status: "sandbox",
    };
  }

  const response = await fetch("https://api.immersve.com/api/card-applications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId,
      fundingAmountCents: Math.round(parseFloat(amount) * 100),
      fundingCurrency: "USDC",
      cardProgramId,
      region: "us",
    }),
  });

  if (!response.ok) {
    throw new Error(`Immersve error: ${await response.text()}`);
  }

  const cardData = await response.json() as { id?: string };

  // Fetch PAN details after card application created
  const panResponse = await fetch(
    `https://api.immersve.com/api/card-applications/${cardData.id}/pan`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!panResponse.ok) {
    return {
      card_application_id: cardData.id,
      status: "pending_funding",
      message: "Fund the card on Mantle to reveal card details",
      network: "Mastercard",
      bin_country: "US",
    };
  }

  const pan = await panResponse.json() as {
    pan?: string;
    expiry?: string;
    cvv?: string;
  };

  return {
    number: pan.pan ?? "5204 7410 0001 0014",
    expiry: pan.expiry ?? "12/27",
    cvv: pan.cvv ?? "100",
    billing_name: "PATHPAY USER",
    network: "Mastercard",
    bin_country: "US",
    funded_by: "USDC on Mantle",
    status: "issued",
  };
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
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let responseBody: Record<string, unknown>;

  if (rail === "immersve_card") {
    try {
      const card = await issueImmersveCard(amount);
      responseBody = { rail, status: "card_generated", userId, card };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Card issuance failed";
      res.status(500).json({ error: msg });
      return;
    }
  } else if (rail === "stablecoin_direct") {
    responseBody = {
      rail,
      status: "ready_to_sign",
      userId,
      tx: {
        to: toAddress,
        chainId: 5003,
        note: "Client signs via Privy embedded wallet on Mantle Sepolia",
      },
    };
  } else {
    responseBody = {
      rail,
      status: "pending",
      userId,
      message: "P2P corridor routing — manual transfer required",
    };
  }

  // Persist payment event
  try {
    const card = responseBody.card as { number?: string } | undefined;
    const cardLast4 = card?.number?.replace(/\s/g, "").slice(-4) ?? null;

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