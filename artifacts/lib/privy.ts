import { PrivyProvider } from "@privy-io/react-auth";
import { mantleSepoliaTestnet } from "viem/chains";

export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  config: {
    loginMethods: ["email", "google", "wallet", "X", "Number", "Phone"],
    appearance: {
      theme: "dark",
      accentColor: "#6366f1",
    },
    embeddedWallets: {
      createOnLogin: "users-without-wallets",
    },
    defaultChain: mantleSepoliaTestnet,
    supportedChains: [mantleSepoliaTestnet],
  },
};
