'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { parseUnits } from 'viem';
import { getRoutingDecision, RoutingDecision } from '../lib/routing-engine';
import { mantleSepolia } from '../lib/chains';

const RAIL_LABELS: Record<string, string> = {
  immersve_card: '💳 Real Mastercard (Immersve + USDC)',
  stablecoin_direct: '⚡ Stablecoin Direct (Mantle)',
};

const RAIL_COLORS: Record<string, string> = {
  stablecoin_direct: 'text-green-400 border-green-500/30 bg-green-500/10',
  virtual_card_stripe: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  virtual_card_lithic: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  immersve_virtual_card: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  p2p_corridor: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
};

const CARD_STEP_LABELS: Record<string, string> = {
  idle: '',
  funding: 'Getting deposit address...',
  waiting: 'Confirming USDC on-chain...',
  issuing: 'Issuing Mastercard...',
  done: '',
};

export default function Dashboard() {
  const { login, logout, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const [tab, setTab] = useState<'copilot' | 'agent'>('copilot');
  const [merchantUrl, setMerchantUrl] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardStep, setCardStep] = useState<'idle' | 'funding' | 'waiting' | 'issuing' | 'done'>('idle');
  const [issuedCard, setIssuedCard] = useState<{
    number: string; expiry: string; cvv: string; type: string; billingName: string;
  } | null>(null);
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  async function handleAnalyze() {
    if (!merchantUrl || !amount) return;
    setLoading(true);
    setDecision(null);
    setError(null);
    setTxHash(null);
    setIssuedCard(null);
    setCardStep('idle');

    try {
      const result = await getRoutingDecision(merchantUrl, amount);
      setDecision(result);
    } catch {
      setError('Routing analysis failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecutePayment() {
    if (!decision || !authenticated) return;
    setLoading(true);
    setError(null);
    setIssuedCard(null);
    setTxHash(null);

    try {
      const token = await getAccessToken();

      // --- STABLECOIN DIRECT ---
      if (decision.recommended_rail === 'stablecoin_direct') {
        if (!embeddedWallet) throw new Error('No embedded wallet found');
        await embeddedWallet.switchChain(mantleSepolia.id);
        const provider = await embeddedWallet.getEthereumProvider();

        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: embeddedWallet.address,
            to: '0x000000000000000000000000000000000000dEaD',
            value: '0x' + parseUnits('0.001', 18).toString(16),
            chainId: '0x138B',
          }],
        });
        setTxHash(hash as string);
        return;
      }

      // --- VIRTUAL CARD VIA IMMERSVE ---
      // Step 1: Onboard user to Supabase
      await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyToken: token, walletAddress, email: user?.email?.address }),
      });

      // Step 2: Create Immersve cardholder + funding source (idempotent)
      await fetch('/api/card/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyToken: token, action: 'setup' }),
      });

      // Step 3: Get USDC deposit address from Immersve
      setCardStep('funding');
      const fundRes = await fetch('/api/card/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyToken: token, action: 'fund', amountUsdc: parseFloat(amount) }),
      });
      const fundData = await fundRes.json();
      if (!fundData.depositAddress) throw new Error('Failed to get deposit address');

      // Step 4: Send USDC on Mantle to Immersve deposit address
      if (!embeddedWallet) throw new Error('No embedded wallet found');
      await embeddedWallet.switchChain(mantleSepolia.id);
      const provider = await embeddedWallet.getEthereumProvider();

      const USDC_CONTRACT = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9';
      const amountHex = parseUnits(amount, 6).toString(16).padStart(64, '0');
      const toHex = fundData.depositAddress.slice(2).padStart(64, '0');
      const transferData = `0xa9059cbb${toHex}${amountHex}`;

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: embeddedWallet.address, to: USDC_CONTRACT, data: transferData }],
      });
      setTxHash(hash as string);

      // Step 5: Wait for on-chain confirmation (webhook in prod, 15s timeout for demo)
      setCardStep('waiting');
      await new Promise(r => setTimeout(r, 15000));

      // Step 6: Issue the Mastercard virtual card
      setCardStep('issuing');
      const issueRes = await fetch('/api/card/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyToken: token, action: 'issue', amountUsdc: parseFloat(amount), merchantUrl }),
      });
      const issueData = await issueRes.json();
      if (!issueData.card) throw new Error(issueData.error || 'Card issuance failed');

      setIssuedCard(issueData.card);
      setCardStep('done');

    } catch (e: any) {
      setError(e.message || 'Payment failed');
      setCardStep('idle');
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentMessage() {
    if (!agentInput.trim()) return;
    const userMsg = agentInput;
    setAgentInput('');
    setAgentMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAgentLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, walletAddress }),
      });
      const data = await res.json();
      setAgentMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setAgentMessages(prev => [...prev, { role: 'assistant', content: 'Failed to process request.' }]);
    } finally {
      setAgentLoading(false);
    }
  }

  const isCardRail = decision && decision.recommended_rail !== 'stablecoin_direct';
  const payButtonLabel = () => {
    if (loading && cardStep !== 'idle') return CARD_STEP_LABELS[cardStep];
    if (loading) return 'Processing...';
    if (!decision) return 'Find Best Route First';
    if (decision.recommended_rail === 'stablecoin_direct') return '⚡ Pay on Mantle';
    return '💳 Generate Virtual Card';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm">P</div>
          <span className="font-semibold text-lg">PathPay</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">Mantle Sepolia</span>
        </div>
        <div className="flex items-center gap-3">
          {authenticated && walletAddress && (
            <span className="text-xs text-gray-400 font-mono bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          )}
          <button
            onClick={authenticated ? logout : login}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            {authenticated ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </header>

      {!authenticated ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4 text-center">
          <h1 className="text-4xl font-bold">Google Maps for Money</h1>
          <p className="text-gray-400 max-w-md">
            PathPay routes your payments through the optimal rail — stablecoin, virtual card, or P2P — bypassing BIN filters and regional blocks automatically.
          </p>
          <button onClick={login} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition-colors">
            Get Started
          </button>
        </div>
      ) : (
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex gap-1 bg-gray-900 p-1 rounded-xl mb-8">
            {(['copilot', 'agent'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'copilot' ? '🛍️ Payment Copilot' : '🤖 SaaS Agent'}
              </button>
            ))}
          </div>

          {tab === 'copilot' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Merchant URL</label>
                <input
                  value={merchantUrl}
                  onChange={e => setMerchantUrl(e.target.value)}
                  placeholder="https://apple.com/shop"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Amount (USDC)</label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="299"
                  type="number"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={loading || !merchantUrl || !amount}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium text-sm transition-colors"
              >
                {loading && !decision ? 'Analyzing payment routes...' : 'Find Best Route'}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {decision && (
                <div className="space-y-3 mt-2">
                  <div className={`p-4 rounded-xl border ${RAIL_COLORS[decision.recommended_rail]}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{RAIL_LABELS[decision.recommended_rail]}</span>
                      <span className="text-xs opacity-70">{Math.round(decision.confidence * 100)}% confidence</span>
                    </div>
                    <p className="text-xs opacity-80 mb-1">{decision.reason}</p>
                    <p className="text-xs opacity-60">via {decision.processor}</p>
                  </div>

                  {decision.mock_billing_address && (
                    <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
                      <p className="text-xs text-gray-400 mb-2 font-medium">Billing address for checkout:</p>
                      <div className="text-sm font-mono space-y-0.5">
                        <p>{decision.mock_billing_address.street}</p>
                        <p>{decision.mock_billing_address.city}, {decision.mock_billing_address.state} {decision.mock_billing_address.zip}</p>
                        <p>{decision.mock_billing_address.country}</p>
                      </div>
                    </div>
                  )}

                  {decision.fallback_rails.length > 0 && (
                    <div className="p-3 bg-gray-900 border border-gray-800 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1.5">Fallbacks:</p>
                      <div className="flex flex-wrap gap-2">
                        {decision.fallback_rails.map(r => (
                          <span key={r} className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-md">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Progress indicator for card issuance */}
                  {loading && cardStep !== 'idle' && (
                    <div className="p-3 bg-gray-900 border border-gray-800 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs text-gray-400">{CARD_STEP_LABELS[cardStep]}</span>
                      </div>
                      <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: cardStep === 'funding' ? '25%' : cardStep === 'waiting' ? '60%' : cardStep === 'issuing' ? '85%' : '100%' }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleExecutePayment}
                    disabled={loading}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium text-sm transition-colors"
                  >
                    {payButtonLabel()}
                  </button>

                  {txHash && !issuedCard && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <p className="text-green-400 text-sm font-medium mb-1">Transaction sent ✓</p>

                        href={`https://explorer.sepolia.mantle.xyz/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:underline font-mono break-all"
                      >
                        {txHash}
                      </a>
                    </div>
                  )}

                  {issuedCard && (
                    <div className="space-y-3">
                      {txHash && (
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                          <p className="text-green-400 text-xs font-medium mb-1">USDC locked on Mantle ✓</p>

                            href={`https://explorer.sepolia.mantle.xyz/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:underline font-mono break-all"
                          >
                            {txHash}
                          </a>
                        </div>
                      )}
                      <div className="p-5 bg-gradient-to-br from-gray-900 to-indigo-950 border border-indigo-500/30 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs text-gray-400 font-medium">VIRTUAL CARD</span>
                          <span className="text-xs text-gray-300 font-bold">{issuedCard.type}</span>
                        </div>
                        <p className="text-xl font-mono tracking-widest mb-4">{issuedCard.number}</p>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">CARDHOLDER</p>
                            <p className="text-sm font-mono">{issuedCard.billingName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 mb-0.5">EXPIRES</p>
                            <p className="text-sm font-mono">{issuedCard.expiry}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 mb-0.5">CVV</p>
                            <p className="text-sm font-mono">{issuedCard.cvv}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        Copy these details into the merchant checkout. Card is locked to {merchantUrl ? new URL(merchantUrl).hostname : 'this merchant'}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl">
                <div>
                  <p className="text-sm font-medium">Session Key</p>
                  <p className="text-xs text-gray-500 mt-0.5">Delegate payment authority to AI agent</p>
                </div>
                <button className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors">
                  Delegate
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl min-h-64 p-4 space-y-3">
                {agentMessages.length === 0 && (
                  <p className="text-gray-600 text-sm text-center pt-8">
                    Try: "Pay my Vercel bill $20" or "Subscribe to Figma for $15"
                  </p>
                )}
                {agentMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-xl text-sm ${
                      m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {agentLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 px-3 py-2 rounded-xl text-sm text-gray-400">Routing payment...</div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAgentMessage()}
                  placeholder="Pay my Figma bill..."
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={handleAgentMessage}
                  disabled={agentLoading}
                  className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}