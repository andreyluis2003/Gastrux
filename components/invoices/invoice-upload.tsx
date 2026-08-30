'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, X, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceUploadProps {
  onUploadSuccess: (invoiceId: string, fileName: string) => void;
  disabled?: boolean;
}

export function InvoiceUpload({ onUploadSuccess, disabled }: InvoiceUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Formato inválido. Use JPEG, PNG, WebP ou PDF.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
      return;
    }
    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Step 1: Create invoice record
      const createRes = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileUrl: `upload://${file.name}`,
        }),
      });

      if (!createRes.ok) throw new Error('Erro ao criar registro');
      const invoice = await createRes.json();

      // Step 2: Process OCR
      const ocrRes = await fetch('/api/invoices/process-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          imageBase64: base64,
          fileName: file.name,
        }),
      });

      if (!ocrRes.ok) {
        toast.error('Erro no processamento OCR. A nota foi salva mas não processada.');
        onUploadSuccess(invoice.id, file.name);
        return;
      }

      onUploadSuccess(invoice.id, file.name);
      setFile(null);
      setPreview(null);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao processar nota fiscal');
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card
        className={`relative border-2 border-dashed transition-all duration-200 cursor-pointer ${
          dragActive
            ? 'border-primary bg-primary/5'
            : file
            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
        }`}
        onClick={() => !file && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          disabled={disabled || uploading}
        />

        {file ? (
          <div className="p-6">
            <div className="flex items-center gap-4">
              {preview ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <p className="font-medium truncate">{file.name}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1].toUpperCase()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <p className="font-medium mb-1">Arraste a nota fiscal aqui</p>
            <p className="text-sm text-muted-foreground mb-3">
              ou clique para selecionar
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span>JPEG, PNG, WebP ou PDF • Máx. 10MB</span>
            </div>
          </div>
        )}
      </Card>

      {/* Upload Button */}
      {file && (
        <Button
          onClick={handleUpload}
          disabled={uploading || disabled}
          className="w-full"
          size="lg"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processando com OCR...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Enviar e Processar
            </>
          )}
        </Button>
      )}
    </div>
  );
}
