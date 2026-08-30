"use client";

import { useEffect, useState, Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { LoadingFallback } from "@/components/ui/loading-fallback";
import { formatDate, formatBRL } from "@/lib/formatters";

const InvoiceUpload = lazy(() =>
  import("@/components/invoices/invoice-upload").then((mod) => ({
    default: mod.InvoiceUpload,
  }))
);

const OCRExtractedData = lazy(() =>
  import("@/components/invoices/ocr-extracted-data").then((mod) => ({
    default: mod.OCRExtractedData,
  }))
);

interface InvoiceListItem {
  id: string;
  fileName: string;
  supplierName?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  status: string;
  uploadedAt: string;
  processedAt?: string;
}

interface DetailedInvoice extends InvoiceListItem {
  invoiceDate?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    matched?: boolean;
  }>;
  notes?: string;
  ocrResult?: {
    processingTime: number;
  };
}

export default function NotasFiscaisPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] =
    useState<DetailedInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const canEdit =
    session?.user?.role === "OWNER" || session?.user?.role === "MANAGER";

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/invoices");
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : data.invoices || []);
    } catch (error) {
      console.error("Erro ao buscar notas:", error);
      toast.error("Falha ao buscar notas fiscais");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (invoiceId: string, fileName: string) => {
    setSelectedInvoiceId(invoiceId);
    fetchInvoices();
    toast.success(`${fileName} processada com sucesso!`);
    fetchInvoiceDetail(invoiceId);
  };

  const fetchInvoiceDetail = async (invoiceId: string) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/invoices`);
      const raw = await response.json();
      const allInvoices = Array.isArray(raw) ? raw : raw.invoices || [];
      const invoice = allInvoices.find(
        (inv: DetailedInvoice) => inv.id === invoiceId
      );
      if (invoice) {
        setSelectedInvoiceDetail(invoice);
      }
    } catch (error) {
      console.error("Erro ao buscar detalhes:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      PENDING: { color: "bg-yellow-100 text-yellow-700", icon: Clock },
      PROCESSING: { color: "bg-blue-100 text-blue-700", icon: Loader2 },
      COMPLETED: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
      FAILED: { color: "bg-red-100 text-red-700", icon: AlertCircle },
      CONFIRMED: { color: "bg-indigo-100 text-indigo-700", icon: CheckCircle },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge className={`gap-1 ${config.color}`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/10 pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/dashboard" label="Voltar" />
              <div>
                <h1 className="text-2xl font-bold">Notas Fiscais</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload e extração automática com OCR
                </p>
              </div>
            </div>
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Nova Nota
            </TabsTrigger>
            <TabsTrigger value="histórico" className="gap-2">
              <Clock className="h-4 w-4" />
              Historico
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            {!canEdit ? (
              <Card className="p-6 border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium">Acesso Restrito</p>
                    <p className="text-sm text-muted-foreground">
                      Apenas gestores e proprietarios podem fazer upload de notas.
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Suspense fallback={<LoadingFallback message="Carregando ferramenta de upload..." />}>
                <InvoiceUpload
                  onUploadSuccess={handleUploadSuccess}
                  disabled={!canEdit}
                />
              </Suspense>
            )}

            {/* Selected Invoice Details */}
            {selectedInvoiceId && (
              <div className="animate-in slide-in-from-bottom-4 duration-300">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Dados Extraidos
                </h2>
                {detailLoading ? (
                  <Card className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                    <p className="text-muted-foreground">Carregando detalhes...</p>
                  </Card>
                ) : selectedInvoiceDetail ? (
                  <Suspense fallback={<LoadingFallback message="Carregando dados extraidos..." />}>
                    <OCRExtractedData
                      invoiceNumber={selectedInvoiceDetail.invoiceNumber}
                      supplierName={selectedInvoiceDetail.supplierName}
                      invoiceDate={selectedInvoiceDetail.invoiceDate}
                      totalAmount={selectedInvoiceDetail.totalAmount}
                      items={selectedInvoiceDetail.items}
                      notes={selectedInvoiceDetail.notes}
                      status={selectedInvoiceDetail.status}
                      processingTime={
                        selectedInvoiceDetail.ocrResult?.processingTime
                      }
                      onCancel={() => setSelectedInvoiceId(null)}
                    />
                  </Suspense>
                ) : null}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="histórico" className="space-y-4">
            {loading ? (
              <Card className="p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                <p className="text-muted-foreground">Carregando notas...</p>
              </Card>
            ) : invoices.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma nota fiscal registrada</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <Card
                    key={invoice.id}
                    className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedInvoiceId(invoice.id);
                      fetchInvoiceDetail(invoice.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">
                              {invoice.fileName}
                            </h3>
                            {invoice.supplierName && (
                              <p className="text-sm text-muted-foreground">
                                {invoice.supplierName}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {invoice.invoiceNumber && (
                            <span>Nota: {invoice.invoiceNumber}</span>
                          )}
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">
                            {formatDate(
                              new Date(invoice.uploadedAt)
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {invoice.totalAmount && (
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold">
                              {formatBRL(invoice.totalAmount)}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {getStatusBadge(invoice.status)}
                          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
