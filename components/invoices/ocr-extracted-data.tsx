'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Building2,
  Calendar,
  Hash,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  X,
} from 'lucide-react';
import { formatBRL, formatDate } from '@/lib/formatters';

interface OCRItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  matched?: boolean;
}

interface OCRExtractedDataProps {
  invoiceNumber?: string;
  supplierName?: string;
  invoiceDate?: string;
  totalAmount?: number;
  items?: OCRItem[];
  notes?: string;
  status?: string;
  processingTime?: number;
  onCancel?: () => void;
}

export function OCRExtractedData({
  invoiceNumber,
  supplierName,
  invoiceDate,
  totalAmount,
  items,
  notes,
  status,
  processingTime,
  onCancel,
}: OCRExtractedDataProps) {
  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Resumo da Nota
          </h3>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {supplierName && (
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Fornecedor</p>
                <p className="font-medium text-sm">{supplierName}</p>
              </div>
            </div>
          )}
          {invoiceNumber && (
            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Número da Nota</p>
                <p className="font-medium text-sm">{invoiceNumber}</p>
              </div>
            </div>
          )}
          {invoiceDate && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="font-medium text-sm">
                  {formatDate(new Date(invoiceDate))}
                </p>
              </div>
            </div>
          )}
          {totalAmount !== undefined && totalAmount !== null && (
            <div className="flex items-start gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="font-semibold text-sm text-emerald-600">
                  {formatBRL(totalAmount)}
                </p>
              </div>
            </div>
          )}
        </div>

        {processingTime !== undefined && (
          <div className="mt-4 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Processado em {(processingTime / 1000).toFixed(1)}s
          </div>
        )}
      </Card>

      {/* Items Table */}
      {items && items.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-4">Itens Extraídos ({items.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left font-semibold">Descrição</th>
                  <th className="py-2 text-right font-semibold">Qtd</th>
                  <th className="py-2 text-right font-semibold">Preço Unit.</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                  <th className="py-2 text-center font-semibold">Match</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-2.5">
                      <span className="font-medium">{item.description}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-2.5 text-right">
                      {formatBRL(item.unitPrice)}
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {formatBRL(item.totalPrice)}
                    </td>
                    <td className="py-2.5 text-center">
                      {item.matched ? (
                        <Badge variant="default" className="gap-1 bg-emerald-100 text-emerald-700 text-xs">
                          <CheckCircle className="h-3 w-3" />
                          Vinculado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <XCircle className="h-3 w-3" />
                          Não vinculado
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Notes */}
      {notes && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-2">Observações</h3>
          <p className="text-sm text-muted-foreground">{notes}</p>
        </Card>
      )}
    </div>
  );
}
