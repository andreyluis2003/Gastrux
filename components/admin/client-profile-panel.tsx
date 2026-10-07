'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, Mail, MessageCircle, NotebookPen, Phone, Trash2, User } from 'lucide-react';
import { STAGES, whatsappLink } from '@/lib/admin/client-health';
import type { ClientProfile } from '@/lib/admin/client-profile';

export interface ClientNote { id: string; authorEmail: string; text: string; createdAt: string }

/**
 * The client's file for the Gastrux team (2026-10-07): who to talk to, what they said at sign-up,
 * how far they got, what is wrong, and the team's own notes.
 */
export function ClientProfilePanel({ restaurantId, profile, notes, onChange }: {
  restaurantId: string;
  profile: ClientProfile;
  notes: ClientNote[];
  onChange: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const c = profile.contact;
  const u = profile.usage;
  const wa = whatsappLink(c.phone);
  const mail = c.ownerEmail || c.restaurantEmail;
  const stageIndex = STAGES.findIndex((s) => s.value === profile.stage);

  async function addNote() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${restaurantId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Não foi possível salvar');
      setText('');
      toast.success('Anotação salva');
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(noteId: string) {
    const res = await fetch(`/api/admin/customers/${restaurantId}/notes?noteId=${noteId}`, { method: 'DELETE' });
    if (res.ok) onChange();
    else toast.error('Não foi possível apagar');
  }

  return (
    <div className="space-y-4">
      {profile.alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-700" />
            {profile.alerts.map((a) => (
              <span key={a.text} className={`text-sm rounded-md px-2 py-0.5 ${a.level === 'red' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                {a.text}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Funnel position */}
      <div className="grid grid-cols-4 gap-1">
        {STAGES.map((s, i) => (
          <div key={s.value} title={s.hint} className={`rounded-md px-2 py-2 text-center text-xs sm:text-sm ${i <= stageIndex ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {s.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Contato</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{c.ownerName || 'Dono sem nome'}</p>
            {c.ownerEmail && <p className="text-muted-foreground">{c.ownerEmail}</p>}
            {c.restaurantEmail && c.restaurantEmail !== c.ownerEmail && <p className="text-muted-foreground">Restaurante: {c.restaurantEmail}</p>}
            <p className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone || 'Sem telefone cadastrado'}</p>
            {c.addressMissing && <p className="text-amber-700 text-xs">Endereço ainda não preenchido</p>}
            <div className="flex gap-2 pt-2">
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="gap-1"><MessageCircle className="h-4 w-4" /> WhatsApp</Button></a>}
              {mail && <a href={`mailto:${mail}`}><Button size="sm" variant="outline" className="gap-1"><Mail className="h-4 w-4" /> E-mail</Button></a>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Respostas do cadastro</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {profile.answers.length === 0 ? (
              <p className="text-muted-foreground">Pulou as perguntas do cadastro.</p>
            ) : profile.answers.map((a) => (
              <p key={a.question}><span className="text-muted-foreground">{a.question}:</span> {a.answer}</p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Uso</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Último acesso:</span> {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString('pt-BR') : 'nunca'}</p>
            <p><span className="text-muted-foreground">Cardápio:</span> {u.menuItems} produtos · {u.recipes} fichas técnicas</p>
            <p><span className="text-muted-foreground">Contas fechadas:</span> {u.closedBills30d} em 30 dias · {u.closedBills} no total</p>
            <p><span className="text-muted-foreground">Pessoas na equipe:</span> {u.users}</p>
            <p><span className="text-muted-foreground">Mercado Pago:</span> {u.mercadoPago}</p>
            <p><span className="text-muted-foreground">Nota fiscal:</span> {u.fiscal}</p>
            <p><span className="text-muted-foreground">Chamados abertos:</span> {u.openTickets}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><NotebookPen className="h-4 w-4" /> Anotações da equipe</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Só a equipe Gastrux vê. Registre ligações, combinados e o que o cliente pediu.</p>
          <textarea
            className="w-full border rounded-md p-2 text-sm min-h-[70px]"
            placeholder="Ex.: Liguei em 07/10, vai cadastrar o cardápio no fim de semana. Pediu ajuda com a nota fiscal."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
          <Button size="sm" onClick={addNote} disabled={busy || !text.trim()}>Salvar anotação</Button>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap">{n.text}</p>
                    <button onClick={() => removeNote(n.id)} className="text-slate-400 hover:text-red-600" aria-label="Apagar anotação"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{n.authorEmail} · {new Date(n.createdAt).toLocaleString('pt-BR')}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
