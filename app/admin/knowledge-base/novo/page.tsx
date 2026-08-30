'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  id: string;
  slug: string;
  name: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function NewArticlePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    categoryId: '',
    title: '',
    slug: '',
    summary: '',
    content: '',
    keywords: '',
    featured: false,
    published: true,
    order: 0,
  });

  useEffect(() => {
    fetch('/api/admin/help/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(console.error);
  }, []);

  const handleTitle = (title: string) => {
    setForm((f) => ({ ...f, title, slug: f.slug || slugify(title) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId || !form.title || !form.slug || !form.content) {
      toast.error('Preencha categoria, título, slug e conteúdo');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/help/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha');
      }
      toast.success('Artigo criado');
      router.push('/admin/knowledge-base');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <Link href="/admin/knowledge-base" className="inline-flex items-center gap-2 text-sm hover:underline">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Novo artigo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Categoria</Label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-background mt-1"
                required
              >
                <option value="">Selecione...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => handleTitle(e.target.value)}
                placeholder="Como faço X?"
                required
              />
            </div>
            <div>
              <Label>Slug (URL)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                placeholder="como-faco-x"
                required
              />
            </div>
            <div>
              <Label>Resumo (opcional)</Label>
              <Input
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Uma frase curta para prévia"
              />
            </div>
            <div>
              <Label>Conteúdo (Markdown)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={14}
                placeholder={'## Título\n\nTexto do artigo...'}
                required
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="csv, importar, planilha"
              />
            </div>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                <span className="text-sm">Destacar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                />
                <span className="text-sm">Publicar imediatamente</span>
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor="order" className="text-sm">Ordem</Label>
                <Input
                  id="order"
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                  className="w-20"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar artigo'}
              </Button>
              <Link href="/admin/knowledge-base">
                <Button type="button" variant="outline">Cancelar</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
