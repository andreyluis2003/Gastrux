'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { FileText, Upload, CheckCircle, XCircle, Loader2, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';

interface ImportResult {
  invoice: { id: string; number: string; supplier: string; total: number; date: string };
  items: { produto: string; matched: boolean; ingredient?: string; qty: number; unit: string }[];
  matchedCount: number;
  totalCount: number;
}

export default function NFeImportPage() {
  const [xmlContent, setXmlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setXmlContent(text);
    setResult(null);
  }

  async function handleImport() {
    if (!xmlContent) {
      toast.error('Selecione um arquivo XML');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/nfe/import-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xmlContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success(`NF-e importada! ${data.matchedCount}/${data.totalCount} itens vinculados`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-blue-600" /> Importar NF-e</h1>
          <p className="text-sm text-gray-500">Importe XML de notas fiscais para atualizar estoque</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-gray-600 mb-3">
            {fileName ? (<span className="font-medium text-blue-600">{fileName}</span>) : 'Arraste ou clique para selecionar o XML da NF-e'}
          </p>
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={handleFileUpload}
            className="hidden"
            id="xml-upload"
          />
          <label htmlFor="xml-upload">
            <Button variant="outline" asChild><span>Selecionar Arquivo XML</span></Button>
          </label>
        </div>

        {xmlContent && (
          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleImport} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processando...</> : <><Package className="h-4 w-4 mr-2" /> Importar e Atualizar Estoque</>}
          </Button>
        )}
      </Card>

      {result && (
        <>
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" /> NF-e Importada
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-gray-500">Número</p><p className="font-bold">{result.invoice.number || '-'}</p></div>
              <div><p className="text-gray-500">Fornecedor</p><p className="font-bold">{result.invoice.supplier || '-'}</p></div>
              <div><p className="text-gray-500">Total</p><p className="font-bold">{formatBRL(result.invoice.total)}</p></div>
              <div><p className="text-gray-500">Vinculados</p><p className="font-bold">{result.matchedCount}/{result.totalCount}</p></div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold mb-3">Itens da Nota</h3>
            <div className="space-y-2">
              {result.items.map((item, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${item.matched ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className="flex items-center gap-3">
                    {item.matched ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-yellow-600" />}
                    <div>
                      <p className="text-sm font-medium">{item.produto}</p>
                      {item.matched && <p className="text-xs text-green-600">Vinculado: {item.ingredient}</p>}
                      {!item.matched && <p className="text-xs text-yellow-600">Não vinculado — cadastre o insumo</p>}
                    </div>
                  </div>
                  <span className="text-sm font-mono">{item.qty} {item.unit}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Card className="p-4 bg-blue-50 border-blue-200">
        <h3 className="font-bold text-sm text-blue-800 mb-2">Como funciona</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Faça upload do XML da NF-e do seu fornecedor</li>
          <li>• O sistema lê os produtos e tenta vincular com seus insumos cadastrados</li>
          <li>• Itens vinculados atualizam o estoque e o custo automaticamente</li>
          <li>• Itens não vinculados ficam pendentes para cadastro manual</li>
        </ul>
      </Card>
    </div>
  );
}
