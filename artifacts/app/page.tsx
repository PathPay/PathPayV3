'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSendTransaction } from 'wagmi';
import { parseUnits } from 'viem';
import { getRoutingDecision, RoutingDecision } from '../lib/routing-engine';
import { mantleSepolia } from '../lib/chains';

const RAIL_LABELS: Record<string, string> = {
  stablecoin_direct: '⚡ Stablecoin Direct (Mantle)',
  virtual_card_stripe: '💳 Virtual Card (Stripe BIN)',
  virtual_card_lithic: '💳 Virtual Card (Lithic BIN)',
  p2p_corridor: '🔄 P2P Corridor',
};

const RAIL_COLORS: Record<string, string> = {
  stablecoin_direct: 'text-green-400 border-green-500/30 bg-green-500/10',
  virtual_card_stripe: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  virtual_card_lithic: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  p2p_corridor: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
};

export default function Dashboard() {
  const { login, logout, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransactionAsync } = useSendTransaction();

  const [tab, setTab] = useState<'copilot' | 'agent'>('copilot');
  const [merchantUrl, setMerchantUrl] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<{role: string; content: string}[]>([]);
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

    try {
      const result = await getRoutingDecision(merchantUrl, amount);
      setDecision(result);
    } catch (e) {
      setError('Routing analysis failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecutePayment() {
    if (!decision || !authenticated) return;
    setLoading(true);
    setError(null);

    try {
      if (decision.recommended_rail === 'stablecoin_direct') {
        // Real on-chain tx via Privy embedded wallet on Mantle Sepolia
        const wallet = embeddedWallet;
        if (!wallet) throw new Error('No embedded wallet found');

        await wallet.switchChain(mantleSepolia.id);
        const provider = await wallet.getEthereumProvider();

        const amountWei = parseUnits(amount, 6); // USDC 6 decimals
        // For testnet demo: send MNT native token to a test address
        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: wallet.address,
            to: '0x000000000000000000000000000000000000dEaD', // testnet burn addr
            value: '0x' + parseUnits('0.001', 18).toString(16), // tiny MNT amount
            chainId: '0x138B', // 5003 hex
          }],
        });
        setTxHash(hash as string);
      } else {
        // Virtual card flow — call execute-payment API
        const token = await getAccessToken();
        const res = await fetch('/api/execute-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privyToken: token,
            toAddress: '0x000000000000000000000000000000000000dEaD',
            amount,
            rail: decision.recommended_rail,
          }),
        });
        const data = await res.json();
        if (data.card) {
          setTxHash(`CARD:${JSON.stringify(data.card)}`);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
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

  const cardData = txHash?.startsWith('CARD:') ? JSON.parse(txHash.slice(5)) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
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
          {/* Tabs */}
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
                  placeholder="https://vercel.com/pricing"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Amount (USDC)</label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="20"
                  type="number"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading || !merchantUrl || !amount}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium text-sm transition-colors"
              >
                {loading ? 'Analyzing payment routes...' : 'Find Best Route'}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {decision && (
                <div className="space-y-3 mt-2">
                  {/* Primary recommendation */}
                  <div className={`p-4 rounded-xl border ${RAIL_COLORS[decision.recommended_rail]}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{RAIL_LABELS[decision.recommended_rail]}</span>
                      <span className="text-xs opacity-70">{Math.round(decision.confidence * 100)}% confidence</span>
                    </div>
                    <p className="text-xs opacity-80 mb-1">{decision.reason}</p>
                    <p className="text-xs opacity-60">via {decision.processor}</p>
                  </div>

                  {/* Virtual card details */}
                  {decision.virtual_card_bin_region && decision.mock_billing_address && (
                    <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
                      <p className="text-xs text-gray-400 mb-2 font-medium">Use this billing address at checkout:</p>
                      <div className="text-sm font-mono space-y-0.5">
                        <p>{decision.mock_billing_address.street}</p>
                        <p>{decision.mock_billing_address.city}, {decision.mock_billing_address.state} {decision.mock_billing_address.zip}</p>
                        <p>{decision.mock_billing_address.country}</p>
                      </div>
                    </div>
                  )}

                  {/* Fallback rails */}
                  {decision.fallback_rails.length > 0 && (
                    <div className="p-3 bg-gray-900 border border-gray-800 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1.5">Fallback options:</p>
                      <div className="flex flex-wrap gap-2">
                        {decision.fallback_rails.map(r => (
                          <span key={r} className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-md">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleExecutePayment}
                    disabled={loading}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl font-medium text-sm transition-colors"
                  >
                    {loading ? 'Executing...' : decision.recommended_rail === 'stablecoin_direct' ? '⚡ Pay on Mantle' : '💳 Generate Virtual Card'}
                  </button>

                  {/* TX result */}
                  {txHash && !cardData && (
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

                  {cardData && (
                    <div className="p-4 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-xl">
                      <p className="text-sm font-medium mb-3 text-indigo-300">Virtual Card Generated</p>
                      <div className="font-mono text-sm space-y-1">
                        <p className="text-lg tracking-widest">{cardData.number}</p>
                        <div className="flex gap-4 text-gray-400 text-xs">
                          <span>EXP {cardData.expiry}</span>
                          <span>CVV {cardData.cvv}</span>
                        </div>
                        <p className="text-gray-400 text-xs">{cardData.billing_name}</p>
                      </div>
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
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-200'
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