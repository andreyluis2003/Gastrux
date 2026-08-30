'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, Card, Label, BackButton, LoadingSkeleton } from '@/components/ui';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  RefreshCw,
  Ban,
  Download,
  FileText,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, any> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-800', label: 'Pendente', icon: Clock },
  submitted: { bg: 'bg-blue-50', text: 'text-blue-800', label: 'Submetido', icon: Clock },
  processing: { bg: 'bg-indigo-50', text: 'text-indigo-800', label: 'Processando', icon: Clock },
  authorized: { bg: 'bg-green-50', text: 'text-green-800', label: 'Autorizado', icon: CheckCircle2 },
  rejected: { bg: 'bg-red-50', text: 'text-red-800', label: 'Rejeitado', icon: XCircle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelado', icon: Ban },
};

const fmtBRL = (n: any) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

const fmtDateTime = (d?: any) => (d ? new Date(d).toLocaleString('pt-BR') : '-');

export default function NFeDocumentDetailPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(false);
  const [qrPng, setQrPng] = useState<string>('');
  const [showCancel, setShowCancel] = useState(false);
  const [justificativa, setJustificativa] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/nfe/documents/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDoc(data);
      if (data.qrCodeData) {
        const png = await QRCode.toDataURL(data.qrCodeData, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 260,
        });
        setQrPng(png);
      } else {
        setQrPng('');
      }
    } catch {
      toast.error('Erro ao carregar documento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (status !== 'authenticated' || !id) return;
    load();
  }, [id, status, load]);

  if (status === 'loading' || loading) return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  if (!doc) return <Card className="m-6 p-6">Documento não encontrado</Card>;

  const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  const handleSubmit = async () => {
    try {
      setAction(true);
      const res = await fetch(`/api/nfe/documents/${id}/submit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.rejectionReason || data.error || 'Erro ao emitir');
      } else {
        toast.success('NFC-e emitida');
      }
      await load();
    } catch {
      toast.error('Erro ao emitir');
    } finally {
      setAction(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      setAction(true);
      const res = await fetch(`/api/nfe/documents/${id}/status`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro');
      } else {
        toast.success(`Status: ${data.providerStatus || doc.status}`);
      }
      await load();
    } catch {
      toast.error('Erro');
    } finally {
      setAction(false);
    }
  };

  const handleCancel = async () => {
    if (justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres');
      return;
    }
    try {
      setAction(true);
      const res = await fetch(`/api/nfe/documents/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa: justificativa.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Erro ao cancelar');
      } else {
        toast.success('NFC-e cancelada');
        setShowCancel(false);
        setJustificativa('');
      }
      await load();
    } catch {
      toast.error('Erro ao cancelar');
    } finally {
      setAction(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">
            {doc.documentType === 'NFCe' ? 'NFC-e' : 'NF-e'} #{String(doc.documentNumber).padStart(6, '0')}
          </h1>
          <p className="text-sm text-muted-foreground">Série {doc.documentSeries}</p>
        </div>
      </div>

      {/* Status card */}
      <Card className={`p-4 ${cfg.bg}`}>
        <div className="flex items-start gap-3">
          <StatusIcon className={cfg.text} size={28} />
          <div className="flex-1">
            <p className={`font-semibold text-lg ${cfg.text}`}>{cfg.label}</p>
            {doc.statusDescription && (
              <p className="text-sm text-muted-foreground">{doc.statusDescription}</p>
            )}
            {doc.rejectionReason && (
              <p className="text-sm text-red-700 mt-1">
                <strong>Motivo:</strong> {doc.rejectionReason}
              </p>
            )}
            {doc.cancellationReason && (
              <p className="text-sm text-gray-700 mt-1">
                <strong>Cancelamento:</strong> {doc.cancellationReason}
              </p>
            )}
            {doc.protocolNumber && (
              <p className="text-xs font-mono text-muted-foreground mt-1">
                Protocolo: {doc.protocolNumber}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(doc.status === 'pending' || doc.status === 'rejected') && (
          <Button onClick={handleSubmit} disabled={action} className="gap-2">
            <Send size={16} /> {doc.status === 'rejected' ? 'Reemitir' : 'Emitir'}
          </Button>
        )}
        {doc.providerRef && doc.status !== 'cancelled' && (
          <Button
            onClick={handleRefreshStatus}
            disabled={action}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw size={16} /> Atualizar status
          </Button>
        )}
        {doc.status === 'authorized' && !showCancel && (
          <Button
            onClick={() => setShowCancel(true)}
            disabled={action}
            variant="outline"
            className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
          >
            <Ban size={16} /> Cancelar
          </Button>
        )}
      </div>

      {showCancel && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={20} />
            <div className="flex-1">
              <p className="font-semibold text-red-900">Cancelar NFC-e</p>
              <p className="text-sm text-red-800">
                A SEFAZ exige justificativa com pelo menos 15 caracteres. Prazo: 30 minutos após a autorização.
              </p>
            </div>
          </div>
          <Label htmlFor="justificativa">Justificativa *</Label>
          <textarea
            id="justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ex: Erro na digitação dos dados do cliente, emitir nova nota."
          />
          <p className="text-xs text-muted-foreground mt-1">
            {justificativa.length} / 15 caracteres mínimos
          </p>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleCancel} disabled={action || justificativa.length < 15} variant="destructive">
              Confirmar cancelamento
            </Button>
            <Button onClick={() => setShowCancel(false)} variant="outline">
              Fechar
            </Button>
          </div>
        </Card>
      )}

      {/* QR Code */}
      {doc.qrCodeData && (
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-3">QR Code NFC-e</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {qrPng && (
              <img
                src={qrPng}
                alt="QR Code NFC-e"
                className="border rounded-md bg-white p-2"
                width={260}
                height={260}
              />
            )}
            <div className="flex-1 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Consulta SEFAZ pelo app do consumidor (leitura do QR).
              </p>
              <a
                href={doc.qrCodeData}
                target="_blank"
                rel="noopener"
                className="text-primary underline break-all inline-block"
              >
                {doc.qrCodeData}
              </a>
              {doc.pdfUrl && (
                <div>
                  <a
                    href={doc.pdfUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 mt-2 text-primary font-semibold"
                  >
                    <FileText size={16} /> Abrir DANFCe PDF
                  </a>
                </div>
              )}
              {doc.xmlUrl && (
                <div>
                  <a
                    href={doc.xmlUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-primary font-semibold"
                  >
                    <Download size={16} /> Baixar XML
                  </a>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Meta */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Dados</h2>
        <dl className="grid gap-2 md:grid-cols-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Chave de acesso</dt>
            <dd className="font-mono break-all">{doc.accessKey || '-'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Valor total</dt>
            <dd>{fmtBRL(doc.totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Cliente</dt>
            <dd>{doc.customerName || '-'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">CPF / CNPJ</dt>
            <dd>{doc.customerCPF || doc.customerCNPJ || '-'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Emissão</dt>
            <dd>{fmtDateTime(doc.issueDate || doc.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Autorizado em</dt>
            <dd>{fmtDateTime(doc.authorizedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Cancelado em</dt>
            <dd>{fmtDateTime(doc.cancelledAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Provider Ref</dt>
            <dd className="font-mono text-xs">{doc.providerRef || '-'}</dd>
          </div>
        </dl>
      </Card>

      {/* Items */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Itens ({doc.items?.length || 0})</h2>
        {(doc.items || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens</p>
        ) : (
          <div className="space-y-2">
            {doc.items.map((it: any) => (
              <div
                key={it.id}
                className="flex justify-between text-sm border-b last:border-b-0 pb-2 last:pb-0"
              >
                <div className="flex-1">
                  <p className="font-medium">{it.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.quantity} {it.unit} x {fmtBRL(it.unitPrice)}
                    {it.ncm ? ` · NCM ${it.ncm}` : ''}
                    {it.cfop ? ` · CFOP ${it.cfop}` : ''}
                  </p>
                </div>
                <div className="font-semibold">{fmtBRL(it.totalPrice)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Logs */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Histórico</h2>
        {(doc.logs || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem eventos</p>
        ) : (
          <div className="space-y-2">
            {doc.logs.map((log: any) => (
              <div key={log.id} className="text-sm border-b last:border-b-0 pb-2 last:pb-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{log.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.eventType} · {fmtDateTime(log.createdAt)}
                    </p>
                    {log.errorMessage && (
                      <p className="text-xs text-red-600 mt-1">Erro: {log.errorMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
