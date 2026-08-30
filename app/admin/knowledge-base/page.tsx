'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Plus, Pencil, Trash2, Eye, EyeOff, Star } from 'lucide-react';
import { toast } from 'sonner';

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featured: boolean;
  published: boolean;
  views: number;
  helpful: number;
  notHelpful: number;
  category: { slug: string; name: string };
  updatedAt: string;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  _count: { articles: number };
}

export default function KnowledgeBaseAdminPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch('/api/admin/help/articles'),
        fetch('/api/admin/help/categories'),
      ]);
      const a = await aRes.json();
      const c = await cRes.json();
      setArticles(a.articles || []);
      setCategories(c.categories || []);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteArticle = async (id: string) => {
    if (!confirm('Apagar este artigo permanentemente?')) return;
    try {
      const res = await fetch(`/api/admin/help/articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      toast.success('Artigo apagado');
      load();
    } catch (e) {
      toast.error('Erro ao apagar');
      console.error(e);
    }
  };

  const togglePublish = async (a: Article) => {
    try {
      const res = await fetch(`/api/admin/help/articles/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !a.published }),
      });
      if (!res.ok) throw new Error('Falha');
      toast.success(a.published ? 'Despublicado' : 'Publicado');
      load();
    } catch (e) {
      toast.error('Erro');
      console.error(e);
    }
  };

  const toggleFeatured = async (a: Article) => {
    try {
      const res = await fetch(`/api/admin/help/articles/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !a.featured }),
      });
      if (!res.ok) throw new Error('Falha');
      load();
    } catch (e) {
      toast.error('Erro');
      console.error(e);
    }
  };

  const filtered = articles.filter((a) => {
    if (filterCategory !== 'all' && a.category.slug !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie artigos e FAQ</p>
        </div>
        <Link href="/admin/knowledge-base/novo">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Novo artigo
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{articles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Publicados</div>
            <div className="text-2xl font-bold text-emerald-600">
              {articles.filter((a) => a.published).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Em destaque</div>
            <div className="text-2xl font-bold text-amber-600">
              {articles.filter((a) => a.featured).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Views totais</div>
            <div className="text-2xl font-bold">
              {articles.reduce((s, a) => s + a.views, 0).toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Artigos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Input
              type="search"
              placeholder="Buscar artigos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            >
              <option value="all">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name} ({c._count.articles})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Nenhum artigo encontrado</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border rounded-lg hover:bg-muted/30 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/knowledge-base/${a.id}/editar`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                      {a.featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          a.published
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {a.published ? 'Publicado' : 'Rascunho'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {a.category.name} · {a.views} views · {a.helpful} 👍 · {a.notHelpful} 👎
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleFeatured(a)} title="Destaque">
                      <Star className={`w-4 h-4 ${a.featured ? 'fill-amber-400 text-amber-500' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => togglePublish(a)}>
                      {a.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Link href={`/admin/knowledge-base/${a.id}/editar`}>
                      <Button size="sm" variant="ghost">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => deleteArticle(a.id)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
