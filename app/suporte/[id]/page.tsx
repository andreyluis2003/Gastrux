// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Loader2, Send, Star, User, Shield, Clock } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: 'Em andamento', color: 'bg-amber-100 text-amber-700' },
  WAITING_CUSTOMER: { label: 'Aguardando você', color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { label: 'Resolvido', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Fechado', color: 'bg-gray-100 text-gray-600' },
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>()
  const ticketId = params?.id as string
  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const load = async () => {
    const res = await fetch(`/api/support/tickets/${ticketId}`)
    const data = await res.json()
    if (res.ok) {
      setTicket(data.ticket)
      if (data.ticket.rating) setRating(data.ticket.rating)
      if (data.ticket.ratingComment) setRatingComment(data.ticket.ratingComment)
    }
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
        body: JSON.stringify({ body: message }),
      })
      if (!res.ok) throw new Error('Erro ao enviar')
      setMessage('')
      await load()
      toast.success('Mensagem enviada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  const closeTicket = async () => {
    if (!confirm('Fechar este ticket?')) return
    const res = await fetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    })
    if (res.ok) {
      toast.success('Ticket fechado')
      await load()
    }
  }

  const submitRating = async () => {
    if (rating < 1) {
      toast.error('Escolha uma nota de 1 a 5')
      return
    }
    const res = await fetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, ratingComment }),
    })
    if (res.ok) {
      toast.success('Obrigado pelo feedback!')
      await load()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card><CardContent className="p-8 text-center">Ticket não encontrado</CardContent></Card>
      </div>
    )
  }

  const status = STATUS_STYLES[ticket.status] || STATUS_STYLES.OPEN
  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED'
  const canRate = isClosed && !ticket.rating

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/suporte" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500 font-mono">#{String(ticket.number || "").padStart(4, "0")}</span>
                  <Badge className={status.color + ' border-0'}>{status.label}</Badge>
                  <Badge variant="outline">{ticket.priority}</Badge>
                  <Badge variant="outline">{ticket.category}</Badge>
                </div>
                <CardTitle>{ticket.subject}</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Aberto em {new Date(ticket.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              {!isClosed && (
                <Button variant="outline" size="sm" onClick={closeTicket}>
                  Fechar ticket
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-3 mb-6">
          {ticket.messages.map((m: any) => {
            const isStaff = m.sender?.role === 'ADMIN' || m.sender?.role === 'OWNER'
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isStaff ? '' : 'flex-row-reverse'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isStaff ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                  {isStaff ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </div>
                <div className={`flex-1 ${isStaff ? '' : 'text-right'}`}>
                  <div className={`inline-block max-w-2xl px-4 py-3 rounded-lg ${isStaff ? 'bg-white border border-gray-200' : 'bg-blue-600 text-white'} ${m.internal ? 'bg-amber-50 border-amber-200' : ''}`}>
                    {m.internal && (
                      <p className="text-xs text-amber-700 font-semibold mb-1">NOTA INTERNA</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1" style={{ justifyContent: isStaff ? 'flex-start' : 'flex-end' }}>
                    <Clock className="h-3 w-3" />
                    {m.sender?.name || 'Usuário'} · {new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {!isClosed && (
          <Card>
            <CardContent className="pt-6">
              <Textarea
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
              <div className="flex justify-end mt-3">
                <Button onClick={sendMessage} disabled={sending || !message.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {canRate && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Avaliar atendimento</CardTitle>
              <p className="text-sm text-gray-600">Como você avalia este atendimento?</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1"
                  >
                    <Star
                      className={`h-8 w-8 ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Comentário opcional"
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                rows={3}
              />
              <Button onClick={submitRating} className="mt-3">
                Enviar avaliação
              </Button>
            </CardContent>
          </Card>
        )}

        {ticket.rating && (
          <Card className="mt-6 bg-emerald-50 border-emerald-200">
            <CardContent className="pt-6">
              <p className="font-semibold mb-2">Sua avaliação</p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-5 w-5 ${n <= ticket.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                ))}
              </div>
              {ticket.ratingComment && <p className="text-sm text-gray-700">{ticket.ratingComment}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
