'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ImportResult {
  successful: number;
  failed: number;
  message: string;
  errors: Array<{
    row: number;
    field: string;
    value: string;
    error: string;
  }>;
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

export function CSVImportDialog({ open, onOpenChange, onImportSuccess }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Por favor, selecione um arquivo CSV');
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Por favor, selecione um arquivo');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ingredients/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Erro ao importar arquivo');
        return;
      }

      setResult(data);
      toast.success(data.message);

      if (data.failed === 0 && data.successful > 0) {
        onImportSuccess?.();
      }
    } catch (error) {
      toast.error('Erro ao importar arquivo');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFile(null);
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Insumos via CSV</DialogTitle>
          <DialogDescription>
            Carregue um arquivo CSV com seus insumos para criar múltiplos itens de uma vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!result ? (
            <>
              {/* File Upload Area */}
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition">
                <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="font-semibold mb-2">Selecione seu arquivo CSV</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Arraste e solte ou clique para selecionar
                </p>
                <label>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    disabled={isLoading}
                    className="hidden"
                  />
                  <Button variant="outline" asChild className="cursor-pointer">
                    <span>Selecionar Arquivo</span>
                  </Button>
                </label>
              </div>

              {file && (
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-200">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    disabled={isLoading}
                  >
                    Remover
                  </Button>
                </div>
              )}

              {/* Template Info */}
              <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                  Formato esperado:
                </p>
                <div className="space-y-1 text-xs text-amber-800 dark:text-amber-200 font-mono">
                  <p>código | nome | descrição | categoria | unidade | unidade_compra | fator_conversão | estoque_mínimo | custo_referência | fornecedor</p>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                  <a
                    href="/exemplo-insumos.csv"
                    download
                    className="underline hover:text-amber-900 dark:hover:text-amber-100"
                  >
                    Baixar exemplo de arquivo →
                  </a>
                </p>
              </div>

              {/* Columns Info */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg space-y-2">
                <p className="text-sm font-semibold mb-3">Colunas obrigatórias:</p>
                <ul className="space-y-1 text-xs">
                  <li className="flex gap-2">
                    <span className="text-red-500 font-bold">*</span>
                    <span><strong>código</strong>: Código único do insumo (ex: ARR001)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500 font-bold">*</span>
                    <span><strong>nome</strong>: Nome do insumo (ex: Arroz Integral)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500 font-bold">*</span>
                    <span><strong>categoria</strong>: Categoria (ex: Grãos)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500 font-bold">*</span>
                    <span><strong>unidade</strong>: Unidade padrão (kg, g, ml, l, un)</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold text-green-900 dark:text-green-100">
                        Sucesso
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {result.successful}
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <span className="text-sm font-semibold text-red-900 dark:text-red-100">
                        Erros
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                      {result.failed}
                    </p>
                  </div>
                </div>

                {/* Errors List */}
                {result.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <span className="font-semibold text-red-900 dark:text-red-100">
                        Erros encontrados ({result.errors.length}):
                      </span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {result.errors.map((error, idx) => (
                        <div key={idx} className="text-xs text-red-800 dark:text-red-200 p-2 bg-red-100 dark:bg-red-900 rounded">
                          <p className="font-mono">
                            <strong>Linha {error.row}</strong> ({error.field})
                          </p>
                          <p>{error.error}</p>
                          {error.value && (
                            <p className="text-red-700 dark:text-red-300 mt-1">
                              Valor: <span className="font-mono">{error.value}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          {result ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                }}
              >
                Importar Outro
              </Button>
              <Button onClick={handleClose}>
                Fechar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!file || isLoading}
              >
                {isLoading ? 'Importando...' : 'Importar'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
