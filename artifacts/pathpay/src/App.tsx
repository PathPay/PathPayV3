import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useBalance, useSignMessage } from "wagmi";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useState, useRef } from "react";
import {
  Wallet, CreditCard, Eye, EyeOff, Copy, ArrowRight,
  Cpu, Activity, ShieldCheck, CheckCircle2, LogOut, ChevronRight, AlertCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { wagmiConfig, arcTestnet } from "@/lib/web3";
import { formatUnits } from "viem";

const queryClient = new QueryClient();

const terminalSequence = [
  "> Initializing PathPay routing engine...",
  "> Detecting merchant gateway: Stripe US (detected)",
  "> Analyzing BIN database for issuer compatibility...",
  "> Bypassing BIN block: 423456 → reassigning to Arc-US-01",
  "> Generating virtual card credentials via Arc Network...",
  "> Assigning US billing address: 215 E 68th St, New York, NY 10065",
  "> Card issued successfully. CVV randomized. Expiry: 08/27",
  "> Routing confirmed via Arc Network. Transaction ready.",
];

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function WalletHeaderSection() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address,
    chainId: arcTestnet.id,
  });

  const formattedBalance = balance
    ? `${parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(2)} ${balance.symbol}`
    : null;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-4">
        <div className="hidden md:flex flex-col items-end mr-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Activity className="w-3 h-3 text-primary" /> Active Wallet
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-base">
              {balanceLoading ? (
                <span className="text-muted-foreground text-sm">Loading...</span>
              ) : formattedBalance ? (
                formattedBalance
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono rounded bg-primary/10 text-primary border-primary/20">
              {chain?.name ?? "ARC NET"}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="border border-primary/30 bg-primary/5 rounded-md px-3 py-1.5 font-mono text-xs text-primary hidden sm:block">
            {truncateAddress(address)}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/50 h-9 w-9"
            onClick={() => disconnect()}
            title="Disconnect wallet"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.type === "injected");

  return (
    <div className="flex items-center gap-4">
      <div className="hidden md:flex flex-col items-end mr-4">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
          <Activity className="w-3 h-3 text-muted-foreground/50" /> No Wallet
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
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={isPending || !injectedConnector}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Wallet className="w-4 h-4 mr-2" />
        )}
        {isPending ? "Connecting..." : injectedConnector ? "Connect" : "No Wallet Found"}
      </Button>
    </div>
  );
}

type ChatMessage = {
  role: "ai" | "user";
  content: React.ReactNode;
  type?: "status" | "success" | "error";
};

function SaasAutoPayTab() {
  const { isConnected } = useAccount();
  const { signMessage, isPending: isSigning, error: signError } = useSignMessage();

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      content: "Ready. Tell me which bill to pay — I'll handle the routing.",
      type: "status",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [awaitingSignature, setAwaitingSignature] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string>("");

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading, awaitingSignature]);

  const executePayment = (userMsg: string) => {
    setIsChatLoading(true);
    setTimeout(() => {
      const mockHash = "0x3f8a9d1c2e4b7f0a5d3c8e1b4f7a2d9e6c3b0f5a" + Math.floor(Math.random() * 9999).toString().padStart(4, "0");
      const shortHash = `${mockHash.slice(0, 6)}...${mockHash.slice(-4)}`;
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          type: "success",
          content: (
            <div className="flex flex-col gap-3 font-mono text-sm leading-relaxed">
              <div className="flex items-center gap-2 text-primary font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Payment routed successfully.</span>
              </div>
              <div className="pl-4 border-l-2 border-primary/30 py-1 space-y-2 text-muted-foreground">
                <p className="text-foreground">Vercel Pro — $20.00 USDC deducted from Arc wallet</p>
                <p>
                  Transaction hash:{" "}
                  <span className="text-primary/80 break-all">{mockHash.slice(0, 10)}...{mockHash.slice(-8)}</span>
                </p>
                <p className="text-xs opacity-70">
                  Arc Network confirmed in 1.2s · Block #18,442,301
                </p>
              </div>
            </div>
          ),
        },
      ]);
      setIsChatLoading(false);
      setAwaitingSignature(false);
    }, 2200);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading || awaitingSignature) return;

    const newMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: newMsg }]);
    pendingMessageRef.current = newMsg;

    if (!isConnected) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          type: "error",
          content: (
            <div className="flex items-center gap-2 text-destructive font-mono text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Connect your wallet first to authorize payments.</span>
            </div>
          ),
        },
      ]);
      return;
    }

    setAwaitingSignature(true);
    setChatMessages((prev) => [
      ...prev,
      {
        role: "ai",
        type: "status",
        content: (
          <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>Requesting wallet signature to authorize payment...</span>
          </div>
        ),
      },
    ]);

    signMessage(
      {
        message: `PathPay payment authorization:\n\n${newMsg}\n\nI authorize this payment from my Arc Network wallet.`,
      },
      {
        onSuccess: () => {
          setChatMessages((prev) => [
            ...prev,
            {
              role: "ai",
              type: "status",
              content: (
                <div className="flex items-center gap-2 font-mono text-sm text-primary/70">
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  <span>Signature verified. Routing payment via Arc Network...</span>
                </div>
              ),
            },
          ]);
          executePayment(newMsg);
        },
        onError: (err) => {
          setAwaitingSignature(false);
          setChatMessages((prev) => [
            ...prev,
            {
              role: "ai",
              type: "error",
              content: (
                <div className="flex items-center gap-2 text-destructive font-mono text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {err.message.includes("User rejected")
                      ? "Signature rejected. Payment cancelled."
                      : `Signature failed: ${err.message.slice(0, 80)}`}
                  </span>
                </div>
              ),
            },
          ]);
        },
      }
    );
  };

  return (
    <div className="w-full max-w-2xl bg-card border border-border/50 rounded-xl shadow-lg flex flex-col h-[600px] overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 bg-background/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium">PathPay AI</h3>
            <p className="text-xs font-mono text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Active
            </p>
          </div>
        </div>
        {!isConnected && (
          <Badge variant="outline" className="text-[10px] font-mono text-amber-500 border-amber-500/30 bg-amber-500/10">
            Connect wallet to pay
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`
                max-w-[85%] rounded-lg px-4 py-3
                ${msg.role === "user"
                  ? "bg-[#1a1a1a] border border-[#2a2a2a] text-foreground"
                  : msg.type === "status"
                  ? "bg-transparent text-muted-foreground font-mono text-sm border-l-2 border-border/50 rounded-none pl-3"
                  : msg.type === "error"
                  ? "bg-destructive/5 border border-destructive/20 rounded-lg"
                  : "bg-primary/5 border border-primary/20"
                }
              `}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isChatLoading && (
          <div className="flex justify-start">
            <div className="font-mono text-xs text-muted-foreground flex items-center gap-2 pl-3 border-l-2 border-border/50">
              PathPay is routing{" "}
              <span className="flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-4 bg-background/50 border-t border-border/50 shrink-0">
        <form onSubmit={handleChatSubmit} className="relative flex items-center">
          <ChevronRight className="absolute left-3 w-5 h-5 text-muted-foreground" />
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="e.g. Pay my 20 USDC Vercel bill"
            className="pl-10 pr-12 h-12 font-mono text-sm bg-card border-border hover:border-primary/30 focus-visible:ring-primary/30 transition-all rounded-lg"
            disabled={isChatLoading || awaitingSignature}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-1.5 h-9 w-9 bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground transition-colors"
            disabled={!chatInput.trim() || isChatLoading || awaitingSignature}
          >
            {awaitingSignature ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
          </Button>
        </form>
        <p className="text-center mt-3 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
          {isConnected ? "Wallet connected · Payments require signature" : "Connect wallet to authorize payments"}
        </p>
      </div>
    </div>
  );
}

function Home() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [cardReady, setCardReady] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const startTerminalSequence = () => {
    if (!merchant || !amount) return;
    setIsGenerating(true);
    setTerminalLines([]);
    setCardReady(false);

    let currentLine = 0;
    const interval = setInterval(() => {
      if (currentLine < terminalSequence.length) {
        setTerminalLines((prev) => [...prev, terminalSequence[currentLine]]);
        currentLine++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsGenerating(false);
          setCardReady(true);
        }, 500);
      }
    }, 400);
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-sans flex flex-col selection:bg-primary/30">
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold text-lg tracking-tighter">
            PP
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:inline-block">PathPay</span>
        </div>
        <WalletHeaderSection />
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col">
        <Tabs defaultValue="physical" className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-muted/50 p-1 border border-border/50 rounded-md">
              <TabsTrigger
                value="physical"
                className="font-mono text-sm px-6 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                Physical Checkout
              </TabsTrigger>
              <TabsTrigger
                value="saas"
                className="font-mono text-sm px-6 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded"
              >
                SaaS Auto-Pay
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: PHYSICAL CHECKOUT */}
          <TabsContent value="physical" className="col-span-full grid grid-cols-1 lg:grid-cols-12 gap-8 m-0 p-0 outline-none">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Generate Route</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Create a single-use or locked card for any merchant. Bypasses standard crypto card BIN restrictions.
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
                      placeholder="e.g. amazon.com"
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
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="text-xs font-mono text-muted-foreground">USDC</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 font-mono uppercase tracking-wider text-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all"
                    onClick={startTerminalSequence}
                    disabled={!merchant || !amount || isGenerating || cardReady}
                  >
                    {isGenerating ? "Routing..." : cardReady ? "Route Established" : "Generate Guaranteed Card"}
                    {!isGenerating && !cardReady && <ArrowRight className="w-4 h-4 ml-2" />}
                    {isGenerating && <span className="ml-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                  </Button>

                  {cardReady && (
                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground text-xs mt-2 hover:text-foreground h-8"
                      onClick={() => {
                        setCardReady(false);
                        setMerchant("");
                        setAmount("");
                        setTerminalLines([]);
                      }}
                    >
                      Reset &amp; Create Another
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg shadow-xl overflow-hidden flex flex-col h-[280px]">
                <div className="flex items-center px-4 py-2 border-b border-[#1f1f1f] bg-[#0f0f0f]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
                  </div>
                  <div className="mx-auto text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                    <Cpu className="w-3 h-3" /> pathpay-routing-engine-v2.1
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

              <div className={`transition-all duration-700 ${cardReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
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
                    <div className="font-mono text-2xl tracking-[0.2em] text-white font-medium drop-shadow-md flex justify-between">
                      <span>4532</span>
                      <span>••••</span>
                      <span>••••</span>
                      <span>8821</span>
                    </div>

                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Cardholder</div>
                        <div className="font-mono text-sm text-white/90 tracking-wider">PATHPAY USER</div>
                      </div>
                      <div className="flex gap-6">
                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Valid Thru</div>
                          <div className="font-mono text-sm text-white/90">08/27</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-white/50 uppercase tracking-widest">CVV</div>
                          <div
                            className="font-mono text-sm text-white/90 flex items-center gap-1 cursor-pointer select-none"
                            onClick={() => setShowCvv(!showCvv)}
                          >
                            {showCvv ? "492" : "•••"}
                            {showCvv ? <EyeOff className="w-3 h-3 text-white/50" /> : <Eye className="w-3 h-3 text-white/50" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-w-[420px] mx-auto mt-4 space-y-3">
                  <div className="bg-card border border-border/50 rounded-lg p-3 flex justify-between items-center group hover:border-primary/30 transition-colors">
                    <div className="space-y-1 overflow-hidden">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Billing Address</div>
                      <div className="font-mono text-xs text-foreground truncate">215 E 68th St, New York, NY 10065, US</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                      onClick={() => navigator.clipboard.writeText("215 E 68th St, New York, NY 10065, US")}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: SAAS AUTO-PAY */}
          <TabsContent value="saas" className="col-span-full m-0 p-0 outline-none flex justify-center">
            <SaasAutoPayTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
