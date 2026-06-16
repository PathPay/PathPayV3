const IMMERSVE_BASE = "https://test.immersve.com/api"; // sandbox
const IMMERSVE_API_KEY = process.env.IMMERSVE_API_KEY!;
const IMMERSVE_ACCOUNT_ID = process.env.IMMERSVE_ACCOUNT_ID!;

export interface ImmersveCard {
  cardId: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  status: string;
  spendingLimit: number;
  currency: string;
}

export interface FundingSource {
  fundingSourceId: string;
  status: string;
  balance: number;
  currency: string;
}

// Step 1: Create a cardholder (once per user)
export async function createCardholder(user: {
  email: string;
  firstName: string;
  lastName: string;
  walletAddress: string;
}) {
  const res = await fetch(`${IMMERSVE_BASE}/cardholders`, {
    method: "POST",
    headers: {
      "X-Api-Key": IMMERSVE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId: IMMERSVE_ACCOUNT_ID,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      externalId: user.walletAddress, // use wallet addr as unique ID
    }),
  });

  if (!res.ok)
    throw new Error(`Cardholder creation failed: ${await res.text()}`);
  return res.json();
}

// Step 2: Create a funding source (links USDC on Mantle)
export async function createFundingSource(
  cardholderId: string,
  walletAddress: string,
) {
  const res = await fetch(`${IMMERSVE_BASE}/funding-sources`, {
    method: "POST",
    headers: {
      "X-Api-Key": IMMERSVE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cardholderId,
      type: "web3",
      chain: "mantleSepolia", // mantle for prod
      walletAddress,
      currency: "USDC",
    }),
  });

  if (!res.ok)
    throw new Error(`Funding source creation failed: ${await res.text()}`);
  return res.json();
}

// Step 3: Get the deposit address + amount to lock USDC
export async function getFundingIntent(
  fundingSourceId: string,
  amountUsdc: number,
) {
  const res = await fetch(
    `${IMMERSVE_BASE}/funding-sources/${fundingSourceId}/intents`,
    {
      method: "POST",
      headers: {
        "X-Api-Key": IMMERSVE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountUsdc * 1_000_000, // 6 decimals
        currency: "USDC",
      }),
    },
  );

  if (!res.ok) throw new Error(`Funding intent failed: ${await res.text()}`);
  return res.json(); // returns { depositAddress, amount, expiresAt }
}

// Step 4: Issue a virtual card once USDC is deposited
export async function issueVirtualCard(
  cardholderId: string,
  fundingSourceId: string,
  spendingLimitUsdc: number,
  merchantUrl?: string,
): Promise<ImmersveCard> {
  const res = await fetch(`${IMMERSVE_BASE}/cards`, {
    method: "POST",
    headers: {
      "X-Api-Key": IMMERSVE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cardholderId,
      fundingSourceId,
      type: "virtual",
      usage: "single-use", // merchant-locked, reduces fraud
      spendingLimit: {
        amount: spendingLimitUsdc * 100, // cents
        currency: "USD",
        interval: "transaction",
      },
      // lock to merchant domain if provided
      ...(merchantUrl && {
        controls: {
          allowedMerchants: [new URL(merchantUrl).hostname],
        },
      }),
    }),
  });

  if (!res.ok) throw new Error(`Card issuance failed: ${await res.text()}`);
  return res.json();
}

// Step 5: Reveal full card details (PAN, CVV)
export async function revealCardDetails(cardId: string): Promise<ImmersveCard> {
  const res = await fetch(`${IMMERSVE_BASE}/cards/${cardId}/reveal`, {
    method: "POST",
    headers: {
      "X-Api-Key": IMMERSVE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`Card reveal failed: ${await res.text()}`);
  return res.json();
}

// Get funding source balance
export async function getFundingSourceBalance(
  fundingSourceId: string,
): Promise<FundingSource> {
  const res = await fetch(
    `${IMMERSVE_BASE}/funding-sources/${fundingSourceId}`,
    {
      headers: { "X-Api-Key": IMMERSVE_API_KEY },
    },
  );

  if (!res.ok) throw new Error(`Balance fetch failed: ${await res.text()}`);
  return res.json();
}
