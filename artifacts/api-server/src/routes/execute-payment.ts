import { Router, type IRouter } from "express";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";

const router: IRouter = Router();

const RequestSchema = z.object({
  privyToken: z.string().min(1),
  toAddress: z.string().min(1),
  amount: z.string().min(1),
  rail: z.enum(["stablecoin_direct", "virtual_card_stripe", "virtual_card_lithic", "p2p_corridor"]),
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

  const { privyToken, toAddress, amount, rail } = parsed.data;

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

  if (rail !== "stablecoin_direct") {
    const lastFour = Math.floor(1000 + Math.random() * 9000);
    res.json({
      rail,
      status: "card_generated",
      userId,
      card: {
        number: `4242 4242 4242 ${lastFour}`,
        expiry: "12/27",
        cvv: `${Math.floor(100 + Math.random() * 900)}`,
        billing_name: "PATHPAY USER",
      },
    });
    return;
  }

  // Stablecoin direct — return unsigned tx for client to sign via Privy embedded wallet
  res.json({
    rail: "stablecoin_direct",
    status: "ready_to_sign",
    userId,
    tx: {
      to: toAddress,
      chainId: 5003,
      note: "Client signs via Privy embedded wallet on Mantle Sepolia",
    },
  });
});

export default router;
