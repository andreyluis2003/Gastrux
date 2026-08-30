'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, BookOpen, HelpCircle, ArrowRight, Star } from 'lucide-react';

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  articleCount: number;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featured: boolean;
  category: { slug: string; name: string; icon: string | null };
}

export default function HelpIndexPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Article[]>([]);
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [catsRes, featRes] = await Promise.all([
          fetch('/api/help/categories'),
          fetch('/api/help/articles?featured=1&limit=6'),
        ]);
        const cats = await catsRes.json();
        const feat = await featRes.json();
        setCategories(cats.categories || []);
        setFeatured(feat.articles || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/help/articles?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data.articles || []);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero */}
      <section className="px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
            <BookOpen className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Central de Ajuda</h1>
          <p className="text-muted-foreground mb-8 text-base">
            Tudo que você precisa para tirar o máximo do Gastrux
          </p>
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar artigos, dúvidas ou funcionalidades..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 pr-4 py-6 text-base shadow-sm bg-white"
            />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 pb-16">
        {/* Search results */}
        {query.trim().length >= 2 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-3">
              {searchResults.length > 0 ? `${searchResults.length} resultado(s)` : 'Nenhum resultado'}
            </h2>
            <div className="space-y-2">
              {searchResults.map((a) => (
                <Link key={a.id} href={`/ajuda/${a.slug}`}>
                  <Card className="hover:shadow-md transition cursor-pointer">
                    <CardContent className="p-4 flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">{a.title}</div>
                        {a.summary && (
                          <div className="text-sm text-muted-foreground mt-1">{a.summary}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {a.category.name}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured */}
        {query.trim().length < 2 && featured.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" /> Artigos em destaque
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((a) => (
                <Link key={a.id} href={`/ajuda/${a.slug}`}>
                  <Card className="h-full hover:shadow-md transition cursor-pointer">
                    <CardContent className="p-5">
                      <div className="text-xs text-blue-600 font-medium mb-2">
                        {a.category.name}
                      </div>
                      <div className="font-semibold mb-2">{a.title}</div>
                      {a.summary && (
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {a.summary}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        {query.trim().length < 2 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Explorar por categoria</h2>
            {loading ? (
              <div className="text-center text-muted-foreground py-8">Carregando...</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {categories.map((c) => (
                  <Link key={c.id} href={`/ajuda/categoria/${c.slug}`}>
                    <Card className="h-full hover:shadow-md transition cursor-pointer">
                      <CardContent className="p-5">
                        <div className="font-semibold mb-1">{c.name}</div>
                        {c.description && (
                          <div className="text-sm text-muted-foreground mb-2">{c.description}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {c.articleCount} artigo{c.articleCount === 1 ? '' : 's'}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* CTA Support */}
        <section className="mt-12 text-center py-10 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white">
          <h3 className="text-2xl font-bold mb-2">Não encontrou o que procurava?</h3>
          <p className="mb-5 opacity-90">Fale com a gente diretamente — atendemos em até 4 horas úteis</p>
          <Link
            href="/suporte"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition"
          >
            Abrir ticket de suporte <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}
