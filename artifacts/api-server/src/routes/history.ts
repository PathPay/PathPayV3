import { Router, type IRouter } from "express";
import { PrivyClient } from "@privy-io/server-auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

function getPrivyClient() {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error("Privy credentials not configured");
  return new PrivyClient(appId, secret);
}

router.get("/history", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  let userId: string;

  try {
    const privyClient = getPrivyClient();
    const claims = await privyClient.verifyAuthToken(token);
    userId = claims.userId;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const { data: history, error } = await supabaseAdmin
      .from("routing_history")
      .select(
        `id, merchant_url, amount, recommended_rail, processor, confidence, created_at,
         payment_events(id, status, tx_hash, card_last4, created_at)`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      req.log.error({ error }, "Failed to fetch routing history");
      res.status(500).json({ error: "Failed to fetch history", history: [] });
      return;
    }

    res.json({ history: history ?? [] });
  } catch (err) {
    req.log.error({ err }, "History fetch error");
    res.status(500).json({ error: "Internal error", history: [] });
  }
});

export default router;
