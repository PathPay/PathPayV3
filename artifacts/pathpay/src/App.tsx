import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useState, useRef } from "react";
import { Wallet, CreditCard, ChevronRight, Eye, EyeOff, Copy, ArrowRight, ArrowRightLeft, Cpu, Activity, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const queryClient = new QueryClient();

const terminalSequence = [
  "> Initializing PathPay routing engine...",
  "> Detecting merchant gateway: Stripe US (detected)",
  "> Analyzing BIN database for issuer compatibility...",
  "> Bypassing BIN block: 423456 → reassigning to Arc-US-01",
  "> Generating virtual card credentials via Arc Network...",
  "> Assigning US billing address: 215 E 68th St, New York, NY 10065",
  "> Card issued successfully. CVV randomized. Expiry: 08/27",
  "> Routing confirmed via Arc Network. Transaction ready."
];

function Home() {
  // Always enforce dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const [activeTab, setActiveTab] = useState("physical");
  
  // Physical Checkout States
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [cardReady, setCardReady] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // SaaS Auto-Pay States
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{role: 'ai' | 'user', content: React.ReactNode, type?: 'status' | 'success'}[]>([
    {
      role: 'ai',
      content: "Ready. Tell me which bill to pay — I'll handle the routing.",
      type: 'status'
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const startTerminalSequence = () => {
    if (!merchant || !amount) return;
    setIsGenerating(true);
    setTerminalLines([]);
    setCardReady(false);
    
    let currentLine = 0;
    
    const interval = setInterval(() => {
      if (currentLine < terminalSequence.length) {
        setTerminalLines(prev => [...prev, terminalSequence[currentLine]]);
        currentLine++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsGenerating(false);
          setCardReady(true);
        }, 500);
      }
    }, 400); // Slower, more deliberate typing feel
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const newMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', content: newMsg }]);
    setIsChatLoading(true);

    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'ai',
        type: 'success',
        content: (
          <div className="flex flex-col gap-3 font-mono text-sm leading-relaxed">
            <div className="flex items-center gap-2 text-primary font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Payment routed successfully.</span>
            </div>
            
            <div className="pl-4 border-l-2 border-primary/30 py-1 space-y-2 text-muted-foreground">
              <p className="text-foreground">Vercel Pro — $20.00 USDC deducted from Arc wallet</p>
              <p>Transaction hash: <span className="text-primary/80">0x3f8a...c291</span></p>
              <p className="text-xs opacity-70">Arc Network confirmed in 1.2s · Block #18,442,301</p>
            </div>
          </div>
        )
      }]);
      setIsChatLoading(false);
    }, 2500);
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatLoading]);

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-sans flex flex-col selection:bg-primary/30">
      
      {/* GLOBAL HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold text-lg tracking-tighter">
            PP
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:inline-block">PathPay</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary" /> Active Wallet
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-lg">500.00 USDC</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono rounded bg-primary/10 text-primary border-primary/20">ARC NET</Badge>
            </div>
          </div>
          
          <Button variant="outline" className="border-border/50 text-foreground/80 hover:text-foreground font-mono uppercase tracking-wider text-xs">
            <Wallet className="w-4 h-4 mr-2" /> Connect
          </Button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col">
        
        <Tabs defaultValue="physical" onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-muted/50 p-1 border border-border/50 rounded-md">
              <TabsTrigger value="physical" className="font-mono text-sm px-6 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded">
                Physical Checkout
              </TabsTrigger>
              <TabsTrigger value="saas" className="font-mono text-sm px-6 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all rounded">
                SaaS Auto-Pay
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
            
            {/* --- TAB 1: PHYSICAL CHECKOUT --- */}
            <TabsContent value="physical" className="col-span-full grid grid-cols-1 lg:grid-cols-12 gap-8 m-0 p-0 outline-none">
              
              {/* Left Column: Input Form */}
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
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
                        Reset & Create Another
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Output / Terminal */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                
                {/* Terminal Window */}
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
                  
                  <div 
                    ref={terminalRef}
                    className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed"
                  >
                    {!isGenerating && !cardReady && terminalLines.length === 0 && (
                      <div className="text-muted-foreground/40 italic flex items-center justify-center h-full">
                        Awaiting route execution parameters...
                      </div>
                    )}
                    
                    {terminalLines.map((line, i) => (
                      <div key={i} className="text-primary/90 mb-1 opacity-0 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-forwards">
                        {line}
                      </div>
                    ))}
                    
                    {isGenerating && (
                      <div className="text-primary/50 animate-pulse mt-1">_</div>
                    )}
                  </div>
                </div>

                {/* Virtual Card (Fades in when ready) */}
                <div className={`transition-all duration-700 ${cardReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                  <div className="bg-gradient-to-br from-slate-800 to-[#0f172a] border border-slate-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden aspect-[1.586/1] max-w-[420px] mx-auto w-full flex flex-col justify-between">
                    
                    {/* Glassy overlays for effect */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/3 pointer-events-none" />
                    
                    <div className="relative z-10 flex justify-between items-start">
                      <div className="w-12 h-8 rounded bg-gradient-to-r from-yellow-200/80 to-yellow-500/80 opacity-80" /> {/* Chip */}
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
                            <div className="font-mono text-sm text-white/90 flex items-center gap-1 cursor-pointer select-none" onClick={() => setShowCvv(!showCvv)}>
                              {showCvv ? "492" : "•••"}
                              {showCvv ? <EyeOff className="w-3 h-3 text-white/50" /> : <Eye className="w-3 h-3 text-white/50" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Billing Details underneath card */}
                  <div className="max-w-[420px] mx-auto mt-4 space-y-3">
                    <div className="bg-card border border-border/50 rounded-lg p-3 flex justify-between items-center group hover:border-primary/30 transition-colors">
                      <div className="space-y-1 overflow-hidden">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Billing Address</div>
                        <div className="font-mono text-xs text-foreground truncate">215 E 68th St, New York, NY 10065, US</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
            </TabsContent>

            {/* --- TAB 2: SAAS AUTO-PAY --- */}
            <TabsContent value="saas" className="col-span-full m-0 p-0 outline-none flex justify-center">
              <div className="w-full max-w-2xl bg-card border border-border/50 rounded-xl shadow-lg flex flex-col h-[600px] overflow-hidden">
                
                {/* Chat Header */}
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
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`
                        max-w-[85%] rounded-lg px-4 py-3 
                        ${msg.role === 'user' 
                          ? 'bg-[#1a1a1a] border border-[#2a2a2a] text-foreground' 
                          : msg.type === 'status' 
                            ? 'bg-transparent text-muted-foreground font-mono text-sm border-l-2 border-border/50 rounded-none' 
                            : 'bg-primary/5 border border-primary/20'
                        }
                      `}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] font-mono text-xs text-muted-foreground flex items-center gap-2">
                        PathPay is routing <span className="flex gap-0.5"><span className="animate-bounce delay-75">.</span><span className="animate-bounce delay-150">.</span><span className="animate-bounce delay-300">.</span></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat Input */}
                <div className="p-4 bg-background/50 border-t border-border/50 shrink-0">
                  <form onSubmit={handleChatSubmit} className="relative flex items-center">
                    <ChevronRight className="absolute left-3 w-5 h-5 text-muted-foreground" />
                    <Input 
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="e.g. Pay my 20 USDC Vercel bill"
                      className="pl-10 pr-12 h-12 font-mono text-sm bg-card border-border hover:border-primary/30 focus-visible:ring-primary/30 transition-all rounded-lg"
                      disabled={isChatLoading}
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      className="absolute right-1.5 h-9 w-9 bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground transition-colors"
                      disabled={!chatInput.trim() || isChatLoading}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </form>
                  <p className="text-center mt-3 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                    Natural language to smart contract routing
                  </p>
                </div>

              </div>
            </TabsContent>

          </div>
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

