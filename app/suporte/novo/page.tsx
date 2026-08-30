'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Send, Loader2, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const CATEGORIES = [
  { value: 'BILLING', label: 'Financeiro / Cobrança' },
  { value: 'TECHNICAL', label: 'Problema Técnico' },
  { value: 'BUG_REPORT', label: 'Relato de Bug' },
  { value: 'FEATURE_REQUEST', label: 'Sugestão de Melhoria' },
  { value: 'INTEGRATION', label: 'Integrações' },
  { value: 'ACCOUNT', label: 'Minha Conta' },
  { value: 'OTHER', label: 'Outro' },
]

const PRIORITIES = [
  { value: 'LOW', label: 'Baixa', desc: 'Dúvida geral ou sugestão' },
  { value: 'NORMAL', label: 'Normal', desc: 'Problema não urgente' },
  { value: 'HIGH', label: 'Alta', desc: 'Impacta a operação' },
  { value: 'URGENT', label: 'Urgente', desc: 'Sistema parado ou dados em risco' },
]

export default function NovoTicketPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipoParam = searchParams.get('tipo')

  const [subject, setSubject] = useState(
    tipoParam === 'enterprise' ? 'Interesse no plano Enterprise' : ''
  )
  const [description, setDescription] = useState(
    tipoParam === 'enterprise'
      ? 'Olá, gostaria de saber mais sobre o plano Enterprise e receber uma proposta personalizada para meu restaurante.'
      : ''
  )
  const [category, setCategory] = useState(
    tipoParam === 'enterprise' ? 'BILLING' : 'OTHER'
  )
  const [priority, setPriority] = useState('NORMAL')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!subject.trim()) {
      toast.error('Informe o assunto do ticket')
      return
    }
    if (!description.trim()) {
      toast.error('Descreva seu problema ou dúvida')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), description: description.trim(), category, priority }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao criar ticket')
      }

      const data = await res.json()
      toast.success('Ticket criado com sucesso! Nossa equipe responderá em breve.')
      router.push(`/suporte/${data.ticket.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/suporte"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao suporte
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Abrir novo ticket</h1>
          <p className="text-gray-600 mt-1">Descreva seu problema ou dúvida e nossa equipe responderá o mais rápido possível.</p>
        </div>

        {/* Dica */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
          <HelpCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Dica rápida</p>
            <p className="mt-0.5">Antes de abrir um ticket, confira nossa{' '}
              <Link href="/ajuda" className="underline font-medium hover:text-blue-900">Base de Conhecimento</Link>
              {' '}— sua dúvida pode já estar respondida lá.
            </p>
          </div>
        </div>

        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes do ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Assunto */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Assunto <span className="text-red-500">*</span>
                </label>
                <Input
                  id="subject"
                  placeholder="Ex: Não consigo importar insumos"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  className="w-full"
                />
              </div>

              {/* Categoria */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Categoria
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prioridade
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        priority === p.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <span className={`block text-sm font-medium ${
                        priority === p.value ? 'text-blue-700' : 'text-gray-900'
                      }`}>
                        {p.label}
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={6}
                  placeholder="Descreva o problema ou dúvida com o máximo de detalhes possível...&#10;&#10;• O que você esperava que acontecesse?&#10;• O que aconteceu de fato?&#10;• Qual navegador ou dispositivo está usando?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y min-h-[120px]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Quanto mais detalhes, mais rápido conseguimos resolver.
                </p>
              </div>

              {/* Botão */}
              <div className="flex justify-end gap-3 pt-2">
                <Link href="/suporte">
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </Link>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {submitting ? 'Enviando...' : 'Criar ticket'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
