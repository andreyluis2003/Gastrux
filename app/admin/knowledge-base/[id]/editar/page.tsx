'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  id: string;
  slug: string;
  name: string;
}

interface ArticleForm {
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  keywords: string;
  featured: boolean;
  published: boolean;
  order: number;
}

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ArticleForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch('/api/admin/help/categories').then((r) => r.json()),
      fetch(`/api/admin/help/articles/${id}`).then((r) => r.json()),
    ])
      .then(([cats, art]) => {
        setCategories(cats.categories || []);
        const a = art.article;
        setForm({
          categoryId: a.categoryId,
          title: a.title,
          slug: a.slug,
          summary: a.summary || '',
          content: a.content,
          keywords: a.keywords || '',
          featured: a.featured,
          published: a.published,
          order: a.order,
        });
      })
      .catch(console.error);
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/help/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Falha');
      toast.success('Atualizado');
      router.push('/admin/knowledge-base');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Apagar este artigo permanentemente?')) return;
    try {
      const res = await fetch(`/api/admin/help/articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      toast.success('Apagado');
      router.push('/admin/knowledge-base');
    } catch (e) {
      toast.error('Erro');
      console.error(e);
    }
  };

  if (!form) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <Link href="/admin/knowledge-base" className="inline-flex items-center gap-2 text-sm hover:underline">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Editar artigo</CardTitle>
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
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
            </div>
            <div>
              <Label>Resumo</Label>
              <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div>
              <Label>Conteúdo (Markdown)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={14}
                className="font-mono text-sm"
                required
              />
            </div>
            <div>
              <Label>Keywords</Label>
              <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-4">
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
                <span className="text-sm">Publicado</span>
              </label>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ordem</Label>
                <Input
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
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" /> Apagar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
