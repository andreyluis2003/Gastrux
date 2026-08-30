'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton, LoadingSkeleton } from '@/components/ui';
import { Copy, Share2, Gift, Users, TrendingUp, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ReferralStats {
  referralCode: string | null;
  bonusEarned: number;
  bonusCount: number;
  referralsCount: number;
  referrals: Array<{
    email: string;
    joinedAt: string;
  }>;
  history: Array<{
    email: string;
    name: string;
    status: string;
    bonusEarned: number | null;
    earnedAt: string | null;
    createdAt: string;
  }>;
}

export default function ReferralPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralUrl, setReferralUrl] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (stats?.referralCode) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://restaurantes.abacusai.app';
      setReferralUrl(`${baseUrl}/?ref=${stats.referralCode}`);
    }
  }, [stats?.referralCode]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/referrals/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else if (response.status === 401) {
        toast.error('Você precisa estar conectado');
      }
    } catch (error) {
      console.error('Error fetching referral stats:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/referrals/generate-code', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        toast.success('Código gerado com sucesso!');
        fetchStats();
      } else {
        toast.error('Erro ao gerar código');
      }
    } catch (error) {
      console.error('Error generating code:', error);
      toast.error('Erro ao gerar código');
    } finally {
      setLoading(false);
    }
  };

  const redeemReferralCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) {
      toast.error('Digite um código válido');
      return;
    }

    try {
      setRedeeming(true);
      const response = await fetch('/api/referrals/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: redeemCode.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message);
        setRedeemCode('');
        fetchStats();
      } else {
        toast.error(data.error || 'Erro ao resgatar código');
      }
    } catch (error) {
      console.error('Error redeeming code:', error);
      toast.error('Erro ao resgatar código');
    } finally {
      setRedeeming(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const shareViaWhatsApp = () => {
    if (!referralUrl) return;
    const message = `🍽️ Olá! Estou usando o Gastrux para gerenciar meu negócio. Quer experimentar também? Use meu código: ${stats?.referralCode}\n\n${referralUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const shareViaEmail = () => {
    if (!referralUrl) return;
    const subject = 'Junte-se ao Gastrux - Ganhe R$ 50 em créditos';
    const body = `Olá!\n\nEstou usando o Gastrux para gerenciar meu restaurante e estou adorando!\n\nUse meu código de referência: ${stats?.referralCode}\n\nSeu link: ${referralUrl}\n\nAmbos ganharemos R$ 50 em créditos!\n\nAtenciosamente`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 pt-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <BackButton />
            <h1 className="text-3xl font-bold mt-4 text-white">Programa de Referência</h1>
          </div>
          <div className="space-y-6">
            <LoadingSkeleton />
            <LoadingSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 pt-20 px-4 sm:px-6 lg:px-8 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <BackButton />
          <h1 className="text-3xl font-bold mt-4 text-white">Programa de Referência</h1>
          <p className="text-slate-400 mt-2">Indique amigos e ganhe R$ 50 em créditos</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Main Referral Section */}
          <Card className="md:col-span-1">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Gift className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold">Seu Código</h2>
              </div>

              {stats?.referralCode ? (
                <div className="space-y-6">
                  {/* Code Display */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-sm text-slate-400 mb-2">Código de Referência</p>
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-lg font-bold text-blue-400 flex-1 break-all">
                        {stats.referralCode}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(stats.referralCode!, 'Código')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* URL Display */}
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-sm text-slate-400 mb-2">Link Compartilhável</p>
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-sm text-green-400 flex-1 truncate">
                        {referralUrl}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(referralUrl, 'Link')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Share Buttons */}
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Compartilhar com:</p>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={shareViaWhatsApp}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        WhatsApp
                      </Button>
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={shareViaEmail}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(referralUrl, 'Link')}>
                        <Share2 className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400 mb-4">Ainda não tem um código de referência?</p>
                  <Button
                    onClick={generateCode}
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={loading}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    Gerar Código Agora
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Stats Section */}
          <div className="space-y-6">
            {/* Bonus Card */}
            <Card className="">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Créditos Ganhos</p>
                    <p className="text-3xl font-bold text-green-400">
                      R$ {(stats?.bonusEarned ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-400" />
                </div>
              </div>
            </Card>

            {/* Referrals Count Card */}
            <Card className="">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Pessoas Indicadas</p>
                    <p className="text-3xl font-bold text-blue-400">
                      {stats?.referralsCount}
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Redeem Code Section */}
        <Card className="mb-8">
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-6">Você Conhece Um Código?</h2>
            <form onSubmit={redeemReferralCode} className="max-w-lg">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Cole o código aqui..."
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  disabled={redeeming}
                />
                <Button
                  type="submit"
                  disabled={redeeming || !redeemCode.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {redeeming ? 'Resgatando...' : 'Resgatar'}
                </Button>
              </div>
            </form>
          </div>
        </Card>

        {/* Referrals List */}
        {stats?.referrals && stats.referrals.length > 0 && (
          <Card className="mb-8">
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-6">Pessoas que Você Indicou</h2>
              <div className="space-y-3">
                {stats.referrals.map((ref, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div>
                      <p className="font-medium">{ref.email}</p>
                      <p className="text-sm text-slate-400">
                        Entrou em {new Date(ref.joinedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">R$ 50,00</p>
                      <p className="text-xs text-slate-400">Bônus para ambos</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* History */}
        {stats?.history && stats.history.length > 0 && (
          <Card>
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-6">Histórico</h2>
              <div className="space-y-3">
                {stats.history.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div>
                      <p className="font-medium">{entry.name || entry.email}</p>
                      <p className="text-sm text-slate-400">
                        {new Date(entry.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      {entry.earnedAt ? (
                        <>
                          <p className="font-bold text-green-400">
                            +R$ {entry.bonusEarned?.toFixed(2)}
                          </p>
                          <p className="text-xs text-slate-400 capitalize">{entry.status}</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 capitalize">{entry.status}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
