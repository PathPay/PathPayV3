import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useBalance } from "wagmi";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Wallet, Eye, EyeOff, Copy, ArrowRight,
  Cpu, Activity, ShieldCheck, CheckCircle2, LogOut,
  ChevronRight, AlertCircle, Loader2, Mail, Zap, CreditCard, RefreshCw,
  Clock, ExternalLink, ArrowDownLeft, ArrowUpRight, QrCode, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { wagmiConfig, arcTestnet } from "@/lib/web3";
import { mantleSepolia } from "@/lib/chains";
import { getRoutingDecision, type RoutingDecision } from "@/lib/routing-engine";
import { parseUnits, formatUnits } from "viem";

const queryClient = new QueryClient();

const STAGED_LOGS = [
  "> Initializing PathPay routing engine...",
  "> Scanning merchant fingerprint...",
  "> Querying AI routing intelligence...",
  "> Analyzing BIN compatibility matrix...",
  "> Evaluating payment rail options...",
];

const RAIL_LABELS: Record<string, string> = {
  immersve_card: "Real Mastercard (Immersve + USDC)",
  stablecoin_direct: "Stablecoin Direct (Mantle)",
  p2p_corridor: "P2P Corridor",
};

const RAIL_STYLES: Record<string, string> = {
  immersve_card: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  stablecoin_direct: "bg-green-500/10 text-green-400 border-green-500/30",
  p2p_corridor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

type HistoryEntry = {
  id: string;
  merchant_url: string;
  amount: string;
  recommended_rail: string;
  processor: string;
  confidence: number;
  created_at: string;
  payment_events: Array<{
    id: string;
    status: string;
    tx_hash?: string | null;
    card_last4?: string | null;
    created_at: string;
  }>;
};

type VirtualCard = {
  number: string;
  expiry: string;
  cvv: string;
  billing_name: string;
};

type AgentMessage = {
  role: "ai" | "user";
  content: string;
  intent?: {
    merchant: string;
    amount_usdc: string;
    recommended_rail: string;
    contract_address: string;
  } | null;
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

// ─── Header ──────────────────────────────────────────────────────────────────

function PrivyHeaderSection() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const wallet = wallets[0];
  const address = wallet?.address;
  const email = user?.email?.address;
  const phone = user?.phone?.number;
  const displayIdentity = address
    ? truncateAddress(address)
    : email ?? phone ?? null;

  const { data: balance, isLoading: balanceLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const formattedBalance = balance
    ? `${parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(2)} ${balance.symbol}`
    : null;

  if (!ready) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  if (authenticated && displayIdentity) {
    return (
      <div className="flex items-center gap-4">
        <div className="hidden md:flex flex-col items-end mr-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Activity className="w-3 h-3 text-primary" />
            {address ? "Wallet" : "Signed In"}
          </span>
          <div className="flex items-center gap-2">
            {address && !balanceLoading && formattedBalance ? (
              <>
                <span className="font-mono font-medium text-base">{formattedBalance}</span>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono rounded bg-primary/10 text-primary border-primary/20">
                  ARC NET
                </Badge>
              </>
            ) : (
              <span className="font-mono text-sm text-muted-foreground truncate max-w-[180px]">{displayIdentity}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="border border-primary/30 bg-primary/5 rounded-md px-3 py-1.5 font-mono text-xs text-primary hidden sm:flex items-center gap-1.5">
            {address ? <Wallet className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
            {displayIdentity}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/50 h-9 w-9"
            onClick={logout}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="hidden md:flex flex-col items-end mr-4">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
          <Activity className="w-3 h-3 text-muted-foreground/50" /> Not Signed In
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-lg text-muted-foreground">—</span>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono rounded bg-muted/50 text-muted-foreground border-border/40">
            ARC NET
          </Badge>
        </div>
      </div>
      <Button
        variant="outline"
        className="border-border/50 text-foreground/80 hover:text-foreground hover:border-primary/40 font-mono uppercase tracking-wider text-xs"
        onClick={login}
      >
        <Wallet className="w-4 h-4 mr-2" />
        Sign In
      </Button>
    </div>
  );
}

// ─── Wallet Tab ───────────────────────────────────────────────────────────────

function WalletTab() {
  const { authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const externalWallet = wallets.find((w) => w.walletClientType !== "privy");
  const activeWallet = embeddedWallet ?? externalWallet;
  const address = activeWallet?.address;

  const { data: mntBalance, isLoading: mntLoading, refetch: refetchMnt } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: mantleSepolia.id,
    query: { enabled: !!address },
  });

  const { data: usdcBalance, isLoading: usdcLoading, refetch: refetchUsdc } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: mantleSepolia.id,
    // @ts-ignore - ERC20 token balance
    token: "0x2c852e740B62308c46DD29B982FBb650D063Bd07",
    query: { enabled: !!address },
  });

  const [copied, setCopied] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendTx, setSendTx] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [txHistory, setTxHistory] = useState<{ hash: string; type: string; amount: string; time: string }[]>([]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refetch = () => {
    refetchMnt();
    refetchUsdc();
  };

  const sendMNT = async () => {
    if (!embeddedWallet || !sendTo || !sendAmount) return;
    setSending(true);
    setSendError(null);
    setSendTx(null);
    try {
      await embeddedWallet.switchChain(mantleSepolia.id);
      const provider = await embeddedWallet.getEthereumProvider();
      const valueHex = "0x" + parseUnits(sendAmount, 18).toString(16);
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: embeddedWallet.address,
          to: sendTo as `0x${string}`,
          value: valueHex,
          chainId: "0x138B",
        }],
      });
      setSendTx(hash as string);
      setTxHistory((prev) => [{
        hash: hash as string,
        type: "Send MNT",
        amount: `${sendAmount} MNT`,
        time: new Date().toISOString(),
      }, ...prev]);
      setSendTo("");
      setSendAmount("");
      setTimeout(refetch, 3000);
    } catch (e: any) {
      setSendError(e.message ?? "Transaction failed");
    } finally {
      setSending(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <Wallet className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="font-mono text-sm font-medium">Sign in to view wallet</p>
          <p className="text-muted-foreground text-xs mt-1">Your embedded wallet is created automatically</p>
        </div>
        <Button onClick={login} className="font-mono text-xs uppercase tracking-wider">
          Sign In
        </Button>
      </div>
    );
  }

  const mntFormatted = mntBalance
    ? parseFloat(formatUnits(mntBalance.value, 18)).toFixed(4)
    : "0.0000";

  const usdcFormatted = usdcBalance
    ? parseFloat(formatUnits(usdcBalance.value, 6)).toFixed(2)
    : "0.00";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">

      {/* Address card */}
      <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Wallet Address</p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
              Mantle Sepolia
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch}>
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {address ? (
          <div
            className="flex items-center justify-between bg-background/50 border border-border/40 rounded-lg px-3 py-2.5 cursor-pointer hover:border-primary/40 transition-colors group"
            onClick={copyAddress}
          >
            <span className="font-mono text-sm text-foreground break-all">{address}</span>
            <div className="ml-3 shrink-0">
              {copied
                ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                : <Copy className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              }
            </div>
          </div>
        ) : (
          <div className="h-10 bg-muted/30 rounded-lg animate-pulse" />
        )}

        {/* Get testnet MNT */}
          <a
          href="https://faucet.testnet.mantle.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Get testnet MNT from faucet →
        </a>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">MNT Balance</p>
          {mntLoading
            ? <div className="h-7 w-24 bg-muted/40 rounded animate-pulse" />
            : <p className="text-2xl font-mono font-semibold">{mntFormatted}</p>
          }
          <p className="text-[10px] text-muted-foreground font-mono">Native gas token</p>
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">USDC Balance</p>
          {usdcLoading
            ? <div className="h-7 w-24 bg-muted/40 rounded animate-pulse" />
            : <p className="text-2xl font-mono font-semibold">{usdcFormatted}</p>
          }
          <p className="text-[10px] text-muted-foreground font-mono">Payment stablecoin</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="flex flex-col h-16 gap-1 font-mono text-xs border-border/50"
          onClick={() => {
            window.open("https://faucet.testnet.mantle.xyz", "_blank");
          }}
        >
          <ArrowDownLeft className="w-4 h-4 text-green-400" />
          Fund
        </Button>
        <Button
          variant="outline"
          className="flex flex-col h-16 gap-1 font-mono text-xs border-border/50"
          onClick={() => setShowSend(!showSend)}
        >
          <Send className="w-4 h-4 text-primary" />
          Send
        </Button>
        <Button
          variant="outline"
          className="flex flex-col h-16 gap-1 font-mono text-xs border-border/50"
          onClick={() => window.open(`https://explorer.sepolia.mantle.xyz/address/${address}`, "_blank")}
        >
          <ExternalLink className="w-4 h-4 text-blue-400" />
          Explorer
        </Button>
      </div>

      {/* Send panel */}
      {showSend && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Send MNT</p>
          {!embeddedWallet && (
            <p className="text-xs text-yellow-400 font-mono bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
              Sign in with email to use embedded wallet for sending
            </p>
          )}
          <Input
            placeholder="Recipient address (0x...)"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            className="font-mono text-sm bg-background/50 border-border/60"
            disabled={!embeddedWallet}
          />
          <Input
            placeholder="Amount (MNT)"
            type="number"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            className="font-mono text-sm bg-background/50 border-border/60"
            disabled={!embeddedWallet}
          />
          <Button
            className="w-full font-mono uppercase tracking-wider text-xs"
            onClick={sendMNT}
            disabled={sending || !sendTo || !sendAmount || !embeddedWallet}
          >
            {sending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Broadcasting...</>
              : <><Send className="w-4 h-4 mr-2" />Send on Mantle</>
            }
          </Button>
          {sendTx && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
              <p className="text-green-400 font-mono text-xs font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Transaction sent
              </p>
              <a
                href={`https://explorer.sepolia.mantle.xyz/tx/${sendTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline break-all block"
              >
                {sendTx}
              </a>
            </div>
          )}
          {sendError && (
            <p className="text-xs font-mono text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {sendError}
            </p>
          )}
        </div>
      )}

      {/* Recent transactions (from this session + Mantle explorer link) */}
      {txHistory.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">This Session</p>
          {txHistory.map((tx) => (
            <div key={tx.hash} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-3.5 h-3.5 text-primary shrink-0" />
                <div>
                  <p className="font-mono text-xs">{tx.type}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{timeAgo(tx.time)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs">{tx.amount}</p>
                <a
                  href={`https://explorer.sepolia.mantle.xyz/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-primary/70 hover:text-primary flex items-center gap-0.5 justify-end"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  {tx.hash.slice(0, 8)}...
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full history on explorer */}
      {address && (
          <a
          href={`https://explorer.sepolia.mantle.xyz/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors py-2"
        >
          <ExternalLink className="w-3 h-3" />
          View full transaction history on Mantle Explorer
        </a>
      )}
    </div>
  );
}

// ─── Agent Tab ───────────────────────────────────────────────────────────

function AgentTab() {
  const { authenticated } = usePrivy();
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: "ai", content: "Ready. Tell me which subscription to pay — I'll route it automatically." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: data.response || "Unable to process.", intent: data.intent },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "Failed to reach payment agent." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="font-mono text-sm font-medium">Sign In Required</p>
          <p className="text-muted-foreground text-xs mt-1">Authenticate to use the payment agent</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto">
      <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium font-mono">Session Key</p>
          <p className="text-xs text-muted-foreground mt-0.5">Delegate payment authority to AI agent</p>
        </div>
        <Button size="sm" variant="outline" className="font-mono text-xs">Delegate</Button>
      </div>

      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl flex flex-col overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-[#1f1f1f] bg-[#0f0f0f]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
          </div>
          <span className="mx-auto text-[10px] font-mono text-muted-foreground flex items-center gap-2">
            <Cpu className="w-3 h-3" /> pathpay-saas-agent-v1.0
          </span>
        </div>
        <div className="flex-1 p-4 space-y-3 overflow-y-auto min-h-64 max-h-80">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-sm px-3 py-2 rounded-xl text-sm font-mono ${
                m.role === "user"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-[#1a1a1a] text-foreground border border-[#2a2a2a]"
              }`}>
                {m.content}
                {m.intent?.merchant && (
                  <div className="mt-2 pt-2 border-t border-[#2a2a2a] text-[10px] text-muted-foreground space-y-0.5">
                    <p>→ {m.intent.merchant} · ${m.intent.amount_usdc} USDC</p>
                    <p className="text-primary/70">{RAIL_LABELS[m.intent.recommended_rail] ?? m.intent.recommended_rail}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-2 rounded-xl text-sm font-mono text-muted-foreground flex items-center gap-2">
                <span className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin inline-block" />
                Routing payment...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder='Try: "Pay my Vercel bill $20" or "Subscribe to Figma $15"'
          className="font-mono text-sm bg-background/50 border-border/60 focus-visible:ring-primary/50"
          disabled={loading}
        />
        <Button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="font-mono uppercase tracking-wider text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { authenticated, getAccessToken } = usePrivy();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setEntries(data.history ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="font-mono text-sm font-medium">Sign In to View History</p>
          <p className="text-muted-foreground text-xs mt-1">Your routing history is saved per account</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-mono text-sm">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <p className="font-mono text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={loadHistory} className="font-mono text-xs">
          <RefreshCw className="w-3 h-3 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <Clock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-mono text-sm font-medium text-muted-foreground">No routes yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Your routing history will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
          {entries.length} route{entries.length !== 1 ? "s" : ""} found
        </p>
        <Button variant="ghost" size="sm" onClick={loadHistory} className="font-mono text-xs h-7 text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {entries.map((entry) => {
        const railStyle = RAIL_STYLES[entry.recommended_rail] ?? "border-border/50 bg-card text-foreground";
        const payment = entry.payment_events?.[0];

        return (
          <div key={entry.id} className="bg-card border border-border/50 rounded-xl p-4 space-y-3 hover:border-border transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-medium truncate">{entry.merchant_url}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  ${entry.amount} USDC · via {entry.processor}
                </p>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">
                {timeAgo(entry.created_at)}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border ${railStyle}`}>
                {entry.recommended_rail === "stablecoin_direct"
                  ? <Zap className="w-2.5 h-2.5" />
                  : <CreditCard className="w-2.5 h-2.5" />}
                {RAIL_LABELS[entry.recommended_rail] ?? entry.recommended_rail}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {Math.round(entry.confidence * 100)}% confidence
              </span>
              {payment && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  payment.status === "card_generated"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    : "bg-green-500/10 text-green-400 border-green-500/30"
                }`}>
                  {payment.status === "card_generated"
                    ? `Card ····${payment.card_last4 ?? "****"}`
                    : "Executed"}
                </span>
              )}
              {payment?.tx_hash && (
                <a
                  href={`https://explorer.sepolia.mantle.xyz/tx/${payment.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-primary/70 hover:text-primary flex items-center gap-1"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  {payment.tx_hash.slice(0, 10)}...
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function Home() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  // Routing state
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [cardReady, setCardReady] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [routingResult, setRoutingResult] = useState<RoutingDecision | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [currentRoutingId, setCurrentRoutingId] = useState<string | undefined>();

  // Payment execution state
  const [executeLoading, setExecuteLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [virtualCard, setVirtualCard] = useState<VirtualCard | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);

  const appendLine = (line: string) => setTerminalLines((prev) => [...prev, line]);

  const startTerminalSequence = async () => {
    if (!merchant || !amount) return;
    setIsGenerating(true);
    setTerminalLines([]);
    setCardReady(false);
    setRoutingResult(null);
    setRoutingError(null);
    setTxHash(null);
    setVirtualCard(null);
    setCurrentRoutingId(undefined);

    for (const log of STAGED_LOGS) {
      appendLine(log);
      await new Promise((r) => setTimeout(r, 900));
    }

    let authToken: string | null = null;
    if (authenticated) {
      authToken = await getAccessToken().catch(() => null);
    }

    let result: RoutingDecision & { routing_id?: string };
    try {
      result = await getRoutingDecision(merchant, amount, "NG", authToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Routing engine unavailable";
      appendLine(`> ERROR: ${msg}`);
      setRoutingError(msg);
      setIsGenerating(false);
      return;
    }

    if (result.routing_id) setCurrentRoutingId(result.routing_id);

    appendLine(`> Processor: ${result.processor}`);
    await new Promise((r) => setTimeout(r, 700));
    appendLine(`> Rail: ${RAIL_LABELS[result.recommended_rail]} (${Math.round(result.confidence * 100)}% confidence)`);
    await new Promise((r) => setTimeout(r, 600));
    appendLine(`> Route established. Ready to execute.`);

    setRoutingResult(result);
    setIsGenerating(false);
    setCardReady(true);
  };

  const executePayment = async () => {
    if (!routingResult) return;
    setExecuteLoading(true);
    setTxHash(null);
    setVirtualCard(null);
    setRoutingError(null);

    try {
      if (routingResult.recommended_rail === "stablecoin_direct") {
        const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
        if (!embeddedWallet) throw new Error("No embedded wallet. Sign in with email first.");
        await embeddedWallet.switchChain(mantleSepolia.id);
        const provider = await embeddedWallet.getEthereumProvider();
        const hash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: embeddedWallet.address,
            to: "0x000000000000000000000000000000000000dEaD",
            value: "0x" + parseUnits("0.001", 18).toString(16),
            chainId: "0x138B",
          }],
        });
        setTxHash(hash as string);
      } else {
        const token = await getAccessToken();
        const res = await fetch("/api/execute-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            privyToken: token,
            toAddress: "0x000000000000000000000000000000000000dEaD",
            amount,
            rail: routingResult.recommended_rail,
            routingId: currentRoutingId,
            merchantUrl: merchant,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Payment failed");
        if (data.card) setVirtualCard(data.card);
      }
    } catch (err: unknown) {
      setRoutingError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setExecuteLoading(false);
    }
  };

  const reset = () => {
    setCardReady(false);
    setMerchant("");
    setAmount("");
    setTerminalLines([]);
    setRoutingResult(null);
    setRoutingError(null);
    setTxHash(null);
    setVirtualCard(null);
    setExecuteLoading(false);
    setCurrentRoutingId(undefined);
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  const railStyle = routingResult
    ? (RAIL_STYLES[routingResult.recommended_rail] ?? "border-border/50 bg-card text-foreground")
    : "";
  const isStablecoin = routingResult?.recommended_rail === "stablecoin_direct";

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-sans flex flex-col selection:bg-primary/30">
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold text-lg tracking-tighter">
            PP
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:inline-block">PathPay</span>
        </div>
        <PrivyHeaderSection />
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col">
        <Tabs defaultValue="wallet" className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-muted/50 p-1 border border-border/50 rounded-md">
              <TabsTrigger
                value="wallet"
                className="font-mono text-sm px-5 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                <Wallet className="w-3.5 h-3.5 mr-1.5" />
                Wallet
              </TabsTrigger>
              <TabsTrigger
                value="physical"
                className="font-mono text-sm px-5 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                Physical Checkout
              </TabsTrigger>
              <TabsTrigger
                value="saas"
                className="font-mono text-sm px-5 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                Auto-Pay
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="font-mono text-sm px-5 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Wallet ────────────────────────────────────────────────── */}
          <TabsContent value="wallet" className="m-0 p-0 outline-none flex justify-center">
            <WalletTab />
          </TabsContent>

          {/* ── Physical Checkout ─────────────────────────────────────── */}
          <TabsContent value="physical" className="grid grid-cols-1 lg:grid-cols-12 gap-8 m-0 p-0 outline-none">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Generate Route</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  AI routes your payment through the optimal rail — stablecoin, virtual card, or P2P.
                </p>
              </div>

              <div className="space-y-5 bg-card border border-border/50 rounded-xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors duration-500" />

                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex justify-between">
                    <span>Merchant Name / URL</span>
                    <span className="text-primary/50">REQ</span>
                  </label>
                  <Input
                    placeholder="e.g. vercel.com"
                    className="font-mono bg-background/50 border-border/60 focus-visible:ring-primary/50 h-11"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    disabled={isGenerating || cardReady}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex justify-between">
                    <span>Amount (USDC)</span>
                    <span className="text-primary/50">REQ</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="font-mono pl-7 bg-background/50 border-border/60 focus-visible:ring-primary/50 h-11"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isGenerating || cardReady}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">USDC</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 font-mono uppercase tracking-wider text-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all"
                  onClick={startTerminalSequence}
                  disabled={!merchant || !amount || isGenerating || cardReady}
                >
                  {isGenerating ? "Analyzing routes..." : cardReady ? "Route Established" : "Find Best Route"}
                  {!isGenerating && !cardReady && <ArrowRight className="w-4 h-4 ml-2" />}
                  {isGenerating && <span className="ml-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                </Button>

                {(cardReady || routingError) && (
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground text-xs hover:text-foreground h-8"
                    onClick={reset}
                  >
                    <RefreshCw className="w-3 h-3 mr-1.5" /> Reset &amp; Try Another
                  </Button>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Terminal */}
              <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg shadow-xl overflow-hidden flex flex-col h-[260px]">
                <div className="flex items-center px-4 py-2 border-b border-[#1f1f1f] bg-[#0f0f0f]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
                  </div>
                  <div className="mx-auto text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                    <Cpu className="w-3 h-3" /> pathpay-routing-engine-v3.0
                  </div>
                </div>
                <div ref={terminalRef} className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
                  {!isGenerating && !cardReady && terminalLines.length === 0 && (
                    <div className="text-muted-foreground/40 italic flex items-center justify-center h-full">
                      Awaiting route execution parameters...
                    </div>
                  )}
                  {terminalLines.map((line, i) => (
                    <div
                      key={i}
                      className="text-primary/90 mb-1 opacity-0 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-forwards"
                    >
                      {line}
                    </div>
                  ))}
                  {isGenerating && <div className="text-primary/50 animate-pulse mt-1">_</div>}
                </div>
              </div>

              {/* Routing result */}
              <div className={`transition-all duration-700 space-y-3 ${cardReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
                {routingResult && (
                  <>
                    {/* Rail badge */}
                    <div className={`border rounded-xl p-4 ${railStyle}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isStablecoin ? <Zap className="w-4 h-4 shrink-0" /> : <CreditCard className="w-4 h-4 shrink-0" />}
                          <span className="font-mono font-semibold text-sm">
                            {RAIL_LABELS[routingResult.recommended_rail]}
                          </span>
                        </div>
                        <span className="text-xs font-mono opacity-70">
                          {Math.round(routingResult.confidence * 100)}% confidence
                        </span>
                      </div>
                      <p className="text-xs opacity-80 font-mono leading-relaxed">{routingResult.reason}</p>
                      <p className="text-xs opacity-50 font-mono mt-1">via {routingResult.processor}</p>
                    </div>

                    {/* Execute button */}
                    {!txHash && !virtualCard && (
                      <>
                        <Button
                          className="w-full h-11 font-mono uppercase tracking-wider text-sm"
                          onClick={executePayment}
                          disabled={executeLoading || !authenticated}
                        >
                          {executeLoading ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Executing...</>
                          ) : isStablecoin ? (
                            <><Zap className="w-4 h-4 mr-2" /> Pay on Mantle</>
                          ) : (
                            <><CreditCard className="w-4 h-4 mr-2" /> Generate Virtual Card</>
                          )}
                        </Button>
                        {!authenticated && (
                          <p className="text-xs text-center text-muted-foreground font-mono">Sign in to execute payment</p>
                        )}
                      </>
                    )}

                    {/* TX hash */}
                    {txHash && (
                      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-green-400 font-mono text-sm font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          Transaction confirmed on Mantle Sepolia
                        </div>
                        <a
                          href={`https://explorer.sepolia.mantle.xyz/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary font-mono break-all hover:underline block"
                        >
                          {txHash}
                        </a>
                      </div>
                    )}

                    {/* Virtual card */}
                    {virtualCard && (
                      <div className="bg-gradient-to-br from-slate-800 to-[#0f172a] border border-slate-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden aspect-[1.586/1] max-w-[420px] mx-auto w-full flex flex-col justify-between">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/3 pointer-events-none" />
                        <div className="relative z-10 flex justify-between items-start">
                          <div className="w-12 h-8 rounded bg-gradient-to-r from-yellow-200/80 to-yellow-500/80 opacity-80" />
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm tracking-widest font-semibold text-white/90">ARC NETWORK</span>
                            <ShieldCheck className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                        <div className="relative z-10 space-y-4">
                          <div className="font-mono text-xl tracking-[0.18em] text-white font-medium drop-shadow-md">
                            {virtualCard.number}
                          </div>
                          <div className="flex justify-between items-end">
                            <div className="space-y-1">
                              <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Cardholder</div>
                              <div className="font-mono text-sm text-white/90 tracking-wider">{virtualCard.billing_name}</div>
                            </div>
                            <div className="flex gap-6">
                              <div className="space-y-1">
                                <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Valid Thru</div>
                                <div className="font-mono text-sm text-white/90">{virtualCard.expiry}</div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">CVV</div>
                                <div
                                  className="font-mono text-sm text-white/90 flex items-center gap-1 cursor-pointer select-none"
                                  onClick={() => setShowCvv(!showCvv)}
                                >
                                  {showCvv ? virtualCard.cvv : "•••"}
                                  {showCvv ? <EyeOff className="w-3 h-3 text-white/50" /> : <Eye className="w-3 h-3 text-white/50" />}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {routingError && (
                      <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs font-mono">
                        {routingError}
                      </div>
                    )}
                  </TabsContent>

          {/* ── Agent ────────────────────────────────────────────── */}
          <TabsContent value="saas" className="m-0 p-0 outline-none flex justify-center">
            <AgentTab />
          </TabsContent>

          {/* ── History ───────────────────────────────────────────────── */}
          <TabsContent value="history" className="m-0 p-0 outline-none flex justify-center">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─── Router & App ─────────────────────────────────────────────────────────────

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "sms", "google", "twitter", "apple", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#22c55e",
          logo: undefined,
          landingHeader: "Sign in to PathPay",
          loginMessage: "Pay anything, from anywhere. No crypto wallet needed.",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: mantleSepolia,
        supportedChains: [mantleSepolia],
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRouter />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}

export default App;
