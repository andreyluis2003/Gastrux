'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Loader2, Receipt, CreditCard, Calendar, TrendingUp, CheckCircle2 } from 'lucide-react'

function formatMoney(value: any, currency = 'BRL') {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value || 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n)
}

export default function CobrancaPage() {
  const [subscription, setSubscription] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/conta/subscription').then((r) => r.json()),
      fetch('/api/invoices').then((r) => r.json()),
    ]).then(([sub, inv]) => {
      setSubscription(sub.subscription)
      setPayments(sub.payments || [])
      setInvoices(inv.invoices || [])
      setLoading(false)
    })
  }, [])

  const downloadInvoice = (id: string, number: string) => {
    const link = document.createElement('a')
    link.href = `/api/invoices/${id}/pdf`
    link.download = `${number}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const subStatus = subscription?.status || 'inactive'
  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    active: { label: 'Ativa', color: 'bg-emerald-100 text-emerald-700' },
    trialing: { label: 'Período de teste', color: 'bg-blue-100 text-blue-700' },
    past_due: { label: 'Pendente', color: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-600' },
    inactive: { label: 'Sem assinatura', color: 'bg-gray-100 text-gray-600' },
  }
  const s = STATUS_LABELS[subStatus] || STATUS_LABELS.inactive

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Cobrança e assinatura</h1>
          <p className="text-gray-600 mt-1">Gerencie seu plano, faturas e histórico de pagamentos.</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sua assinatura</CardTitle>
              <Badge className={s.color + ' border-0'}>{s.label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Plano</p>
                  <p className="font-semibold text-lg mt-1">{subscription.planName || subscription.tier}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Valor</p>
                  <p className="font-semibold text-lg mt-1">
                    {formatMoney(subscription.amount, subscription.currency)}
                    <span className="text-sm text-gray-500 font-normal"> / {subscription.billingCycle === 'annual' ? 'ano' : 'mês'}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Próximo ciclo</p>
                  <p className="font-semibold text-lg mt-1">
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')
                      : '—'}
                  </p>
                </div>
                {subscription.cancelAtPeriodEnd && (
                  <div className="md:col-span-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    Sua assinatura será cancelada ao final do período atual.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-gray-600 mb-4">Você ainda não tem uma assinatura ativa.</p>
                <Link href="/pricing">
                  <Button>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Ver planos disponíveis
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Faturas emitidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="py-8 text-center text-gray-500">Nenhuma fatura emitida ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Número</th>
                      <th className="py-2 pr-4">Descrição</th>
                      <th className="py-2 pr-4">Data</th>
                      <th className="py-2 pr-4">Valor</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 pr-4 font-mono text-xs">{inv.number}</td>
                        <td className="py-3 pr-4 truncate max-w-xs">{inv.description}</td>
                        <td className="py-3 pr-4">{new Date(inv.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td className="py-3 pr-4 font-semibold">{formatMoney(inv.total, inv.currency)}</td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant="outline"
                            className={
                              inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              inv.status === 'OVERDUE' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-blue-50 text-blue-700 border-blue-200'
                            }
                          >
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Button size="sm" variant="outline" onClick={() => downloadInvoice(inv.id, inv.number)}>
                            <Download className="h-3 w-3 mr-1" />
                            PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Histórico de pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-8 text-center text-gray-500">Nenhum pagamento registrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Data</th>
                      <th className="py-2 pr-4">Descrição</th>
                      <th className="py-2 pr-4">Método</th>
                      <th className="py-2 pr-4">Valor</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 pr-4">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td className="py-3 pr-4">{p.description || p.gatewayPaymentId || '—'}</td>
                        <td className="py-3 pr-4 text-xs uppercase">{p.paymentMethod || p.method || '—'}</td>
                        <td className="py-3 pr-4 font-semibold">{formatMoney(p.amount, p.currency || 'BRL')}</td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant="outline"
                            className={
                              p.status === 'approved' || p.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              p.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              p.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-500">
          Precisa de ajuda?
          {' '}
          <Link href="/suporte" className="text-blue-600 hover:underline">Abra um ticket de suporte</Link>
        </div>
      </div>
    </div>
  )
}
