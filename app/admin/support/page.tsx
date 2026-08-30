// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, MessageSquare, User, Building2, Clock } from 'lucide-react'

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: 'Em andamento', color: 'bg-amber-100 text-amber-700' },
  WAITING_CUSTOMER: { label: 'Aguardando cliente', color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { label: 'Resolvido', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Fechado', color: 'bg-gray-100 text-gray-600' },
}

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'NORMAL', 'LOW']

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status !== 'all') params.set('status', status)
    if (priority !== 'all') params.set('priority', priority)
    const res = await fetch(`/api/admin/support/tickets?${params.toString()}`)
    const data = await res.json()
    setTickets(data.tickets || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [status, priority])

  const openCount = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'].includes(t.status)).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suporte — Tickets</h1>
        <p className="text-gray-600 mt-1">{openCount} ticket{openCount !== 1 ? 's' : ''} em aberto</p>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <form
              onSubmit={(e) => { e.preventDefault(); load() }}
              className="flex-1 flex gap-2"
            >
              <Input
                placeholder="Buscar por assunto ou descrição..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button type="submit" variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </form>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="OPEN">Aberto</SelectItem>
                <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
                <SelectItem value="WAITING_CUSTOMER">Aguardando</SelectItem>
                <SelectItem value="RESOLVED">Resolvido</SelectItem>
                <SelectItem value="CLOSED">Fechado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="URGENT">Urgente</SelectItem>
                <SelectItem value="HIGH">Alta</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="LOW">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : tickets.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-500">Nenhum ticket encontrado</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const s = STATUS_STYLES[t.status] || STATUS_STYLES.OPEN
            return (
              <Link key={t.id} href={`/admin/support/${t.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-12 rounded ${
                        t.priority === 'URGENT' ? 'bg-red-500' :
                        t.priority === 'HIGH' ? 'bg-amber-500' :
                        t.priority === 'NORMAL' ? 'bg-blue-500' :
                        'bg-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 font-mono">#{String(t.number || "").padStart(4, "0")}</span>
                          <Badge className={s.color + ' border-0'}>{s.label}</Badge>
                          <Badge variant="outline" className="text-xs">{t.priority}</Badge>
                          <Badge variant="outline" className="text-xs">{t.category}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-900 truncate">{t.subject}</h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.user?.name}</span>
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{t.restaurant?.name}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t._count.messages}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(t.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {t.assignedTo && <span className="text-blue-600">→ {t.assignedTo.name}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
