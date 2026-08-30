// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Send, User, Shield, Clock, Building2, Mail } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>()
  const { data: session } = useSession() || {}
  const ticketId = params?.id as string
  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [internal, setInternal] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/admin/support/tickets/${ticketId}`)
    const data = await res.json()
    if (res.ok) setTicket(data.ticket)
    setLoading(false)
  }

  useEffect(() => {
    if (ticketId) load()
  }, [ticketId])

  const sendMessage = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: message, isInternal: internal }),
      })
      if (!res.ok) throw new Error('Erro ao enviar')
      setMessage('')
      setInternal(false)
      await load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  const updateField = async (data: Record<string, any>) => {
    await fetch(`/api/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await load()
    toast.success('Atualizado')
  }

  const assignToMe = async () => {
    if (!session?.user?.id) return
    await updateField({ assignedToId: session.user.id })
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!ticket) return <div className="p-6">Ticket não encontrado</div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/support" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 font-mono">#{String(ticket.number || "").padStart(4, "0")}</span>
                <Badge>{ticket.category}</Badge>
              </div>
              <CardTitle>{ticket.subject}</CardTitle>
            </CardHeader>
          </Card>

          <div className="space-y-3 mb-4">
            {ticket.messages.map((m: any) => {
              const isStaff = m.sender?.role === 'ADMIN' || m.sender?.role === 'OWNER'
              return (
                <div key={m.id} className={`flex gap-3 ${isStaff ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isStaff ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                    {isStaff ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  </div>
                  <div className={`flex-1 ${isStaff ? '' : 'text-right'}`}>
                    <div className={`inline-block max-w-2xl px-4 py-3 rounded-lg text-left ${m.internal ? 'bg-amber-50 border border-amber-200' : isStaff ? 'bg-white border border-gray-200' : 'bg-blue-600 text-white'}`}>
                      {m.internal && <p className="text-xs text-amber-700 font-semibold mb-1">NOTA INTERNA (não visível ao cliente)</p>}
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1" style={{ justifyContent: isStaff ? 'flex-start' : 'flex-end' }}>
                      <Clock className="h-3 w-3" />
                      {m.sender?.name} · {new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <Card>
            <CardContent className="pt-6">
              <Textarea
                placeholder="Sua resposta..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
              <div className="flex items-center justify-between mt-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={internal} onCheckedChange={(v) => setInternal(!!v)} />
                  Nota interna (não envia para o cliente)
                </label>
                <Button onClick={sendMessage} disabled={sending || !message.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{ticket.user?.name}</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" />{ticket.user?.email}</div>
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-gray-400" />{ticket.restaurant?.name}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
            <CardContent>
              <Select value={ticket.status} onValueChange={(v) => updateField({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Aberto</SelectItem>
                  <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
                  <SelectItem value="WAITING_CUSTOMER">Aguardando cliente</SelectItem>
                  <SelectItem value="RESOLVED">Resolvido</SelectItem>
                  <SelectItem value="CLOSED">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Prioridade</CardTitle></CardHeader>
            <CardContent>
              <Select value={ticket.priority} onValueChange={(v) => updateField({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Baixa</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">Alta</SelectItem>
                  <SelectItem value="URGENT">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Atendente</CardTitle></CardHeader>
            <CardContent>
              {ticket.assignedTo ? (
                <p className="text-sm mb-2">{ticket.assignedTo.name}</p>
              ) : (
                <p className="text-sm text-gray-500 mb-2">Não atribuído</p>
              )}
              <Button size="sm" variant="outline" onClick={assignToMe}>
                Atribuir a mim
              </Button>
            </CardContent>
          </Card>

          {ticket.rating && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Avaliação do cliente</CardTitle></CardHeader>
              <CardContent>
                <p className="font-semibold">{ticket.rating} / 5 estrelas</p>
                {ticket.ratingComment && <p className="text-sm text-gray-600 mt-1">{ticket.ratingComment}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
