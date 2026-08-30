// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Plus, BookOpen, Clock, CheckCircle2, Loader2 } from 'lucide-react'

interface Ticket {
  id: string
  subject: string
  category: string
  priority: string
  status: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
  assignedTo: { id: string; name: string } | null
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: 'Em andamento', color: 'bg-amber-100 text-amber-700' },
  WAITING_CUSTOMER: { label: 'Aguardando você', color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { label: 'Resolvido', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Fechado', color: 'bg-gray-100 text-gray-600' },
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
}

export default function SuportePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/support/tickets')
      .then((r) => r.json())
      .then((data) => setTickets(data.tickets || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Central de Suporte</h1>
            <p className="text-gray-600 mt-1">Seus tickets e conversas com nossa equipe.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/ajuda">
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Base de conhecimento
              </Button>
            </Link>
            <Link href="/suporte/novo">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo ticket
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Nenhum ticket por enquanto</h3>
              <p className="text-gray-600 mt-1 mb-6 max-w-md mx-auto">
                Se você tiver alguma dúvida ou problema, abra um ticket e nossa equipe ajudará você.
              </p>
              <Link href="/suporte/novo">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Abrir primeiro ticket
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const status = STATUS_STYLES[t.status] || STATUS_STYLES.OPEN
              const priorityColor = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.NORMAL
              return (
                <Link key={t.id} href={`/suporte/${t.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-500 font-mono">#{t.id.slice(-6).toUpperCase()}</span>
                            <Badge className={status.color + ' border-0 font-medium'}>
                              {status.label}
                            </Badge>
                            <Badge variant="outline" className={priorityColor + ' border-0 font-medium text-xs'}>
                              {t.priority}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-gray-900 truncate">{t.subject}</h3>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {t._count.messages} mensagem{t._count.messages !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(t.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            {t.assignedTo && (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Atendido por {t.assignedTo.name}
                              </span>
                            )}
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
    </div>
  )
}
