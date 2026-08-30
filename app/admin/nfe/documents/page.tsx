'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import { Eye, AlertCircle, QrCode } from 'lucide-react';

interface NFeDocument {
  id: string;
  documentNumber: number;
  documentSeries: number;
  documentType: string;
  status: string;
  totalAmount: any;
  issueDate: string;
  createdAt: string;
  accessKey?: string | null;
  xmlUrl?: string | null;
  pdfUrl?: string | null;
  qrCodeData?: string | null;
  customerName?: string | null;
  customerCPF?: string | null;
  customerCNPJ?: string | null;
  rejectionReason?: string | null;
}

const STATUS_CONFIG: Record<string, any> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-800', label: 'Pendente' },
  submitted: { bg: 'bg-blue-50', text: 'text-blue-800', label: 'Submetido' },
  processing: { bg: 'bg-indigo-50', text: 'text-indigo-800', label: 'Processando' },
  authorized: { bg: 'bg-green-50', text: 'text-green-800', label: 'Autorizado' },
  rejected: { bg: 'bg-red-50', text: 'text-red-800', label: 'Rejeitado' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelado' },
};

const formatBRL = (n: any) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

const formatDateTime = (d?: string | Date | null) => {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function NFeDocumentsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [documents, setDocuments] = useState<NFeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchDocuments();
  }, [filterStatus, filterType, status]);

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  async function fetchDocuments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);

      const response = await fetch(`/api/nfe/documents?${params}`);
      if (!response.ok) throw new Error('Failed');

      const data = await response.json();
      let docs: NFeDocument[] = data.documents || [];
      if (filterType !== 'all') {
        docs = docs.filter((d) => d.documentType === filterType);
      }
      setDocuments(docs);
    } catch {
      toast.error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  }

  const filtered = documents.filter((doc) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(doc.documentNumber).includes(q) ||
      (doc.accessKey || '').toLowerCase().includes(q) ||
      (doc.customerName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Documentos NF-e/NFC-e</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Histórico de documentos fiscais emitidos
          </p>
        </div>
        <Button
          onClick={() => router.push('/admin/nfe/config')}
          variant="outline"
          className="gap-2"
        >
          <AlertCircle size={18} />
          Configuração
        </Button>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="search">Buscar</Label>
            <Input
              id="search"
              placeholder="Número, chave ou cliente"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="submitted">Submetido</option>
              <option value="authorized">Autorizado</option>
              <option value="rejected">Rejeitado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="NFe">NF-e</option>
              <option value="NFCe">NFC-e</option>
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton count={5} />
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum documento fiscal encontrado
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            return (
              <Card
                key={doc.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${cfg.bg}`}
                onClick={() => router.push(`/admin/nfe/documents/${doc.id}`)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono font-semibold ${cfg.text}`}>
                        #{String(doc.documentNumber).padStart(6, '0')}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-background">
                        {doc.documentType === 'NFCe' ? 'NFC-e' : 'NF-e'}
                      </span>
                      <span className={`text-sm font-semibold ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {doc.qrCodeData && <QrCode size={16} className="text-muted-foreground" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(doc.issueDate || doc.createdAt)} · {formatBRL(doc.totalAmount)}
                      {doc.customerName ? ` · ${doc.customerName}` : ''}
                    </p>
                    {doc.accessKey && (
                      <p className="text-xs font-mono text-muted-foreground break-all">
                        Chave: {doc.accessKey}
                      </p>
                    )}
                    {doc.status === 'rejected' && doc.rejectionReason && (
                      <p className="text-xs text-red-700">
                        <strong>Rejeição:</strong> {doc.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/nfe/documents/${doc.id}`);
                      }}
                      className="gap-1"
                    >
                      <Eye size={14} /> Abrir
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
