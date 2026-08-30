'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Upload, Video, CheckCircle, Loader2, Trash2 } from 'lucide-react';

export default function DemoVideoUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCurrentVideo();
  }, []);

  const fetchCurrentVideo = async () => {
    try {
      const res = await fetch('/api/admin/demo-video');
      const data = await res.json();
      if (data.url) {
        setCurrentVideoUrl(data.url);
      }
    } catch (error) {
      console.error('Failed to fetch current video:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Por favor, selecione um arquivo de vídeo (MP4, WebM, etc.)');
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 500MB');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo primeiro');
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      // Step 1: Get presigned URL
      const presignedRes = await fetch('/api/admin/demo-video/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          contentType: selectedFile.type,
        }),
      });

      if (!presignedRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, cloud_storage_path } = await presignedRes.json();
      setProgress(20);

      // Step 2: Upload file directly to S3
      // Check if content-disposition is in signed headers
      const url = new URL(uploadUrl);
      const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') || '';
      const needsContentDisposition = signedHeaders.includes('content-disposition');

      const uploadHeaders: Record<string, string> = {
        'Content-Type': selectedFile.type,
      };
      if (needsContentDisposition) {
        uploadHeaders['Content-Disposition'] = 'attachment';
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: selectedFile,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload to storage');
      setProgress(80);

      // Step 3: Save cloud_storage_path
      const saveRes = await fetch('/api/admin/demo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_storage_path }),
      });

      if (!saveRes.ok) throw new Error('Failed to save video reference');
      const { url: videoUrl } = await saveRes.json();
      setProgress(100);

      setCurrentVideoUrl(videoUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      toast.success('Vídeo de demonstração atualizado com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do vídeo. Tente novamente.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Vídeo de Demonstração</h1>
            <p className="text-sm text-slate-600">Faça upload do vídeo que será exibido na landing page</p>
          </div>
        </div>

        {/* Current Video */}
        {currentVideoUrl && (
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Video className="h-5 w-5 text-blue-600" />
              Vídeo Atual
            </h2>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={currentVideoUrl}
                controls
                className="w-full h-full object-contain"
              />
            </div>
          </Card>
        )}

        {/* Upload Section */}
        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-green-600" />
            {currentVideoUrl ? 'Substituir Vídeo' : 'Upload de Vídeo'}
          </h2>

          {/* Drop Zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={handleFileSelect}
            />
            {selectedFile ? (
              <div className="space-y-3">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                <div>
                  <p className="font-semibold text-lg">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="h-12 w-12 mx-auto text-gray-400" />
                <div>
                  <p className="font-semibold text-lg">Clique para selecionar o vídeo</p>
                  <p className="text-sm text-gray-500">MP4, WebM • Máx. 500MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Preview:</h3>
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {uploading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Enviando...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {uploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Enviar Vídeo</>
              )}
            </Button>
            {selectedFile && !uploading && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Limpar
              </Button>
            )}
          </div>
        </Card>

        {/* Instructions */}
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="font-bold mb-2">📝 Instruções</h3>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• Formato recomendado: <strong>MP4</strong> (H.264)</li>
            <li>• Resolução ideal: <strong>1920x1080</strong> (Full HD)</li>
            <li>• Tamanho máximo: <strong>500MB</strong></li>
            <li>• O vídeo será exibido na página inicial como demonstração do produto</li>
            <li>• Após o upload, o vídeo substitui automaticamente o carrossel atual</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
