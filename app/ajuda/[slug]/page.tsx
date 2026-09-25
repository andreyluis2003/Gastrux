'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  views: number;
  helpful: number;
  notHelpful: number;
  updatedAt: string;
  category: { slug: string; name: string };
}

interface Related {
  slug: string;
  title: string;
  summary: string | null;
}

// Super light markdown renderer (h2, h3, bold, lists, blockquote, code, images)
function renderMarkdown(md: string): string {
  const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inOL = false;

  const flush = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    if (inOL) {
      out.push('</ol>');
      inOL = false;
    }
  };

  // Escaping happens first so an attacker-controlled alt/src can't break out
  // of the attribute; the src is additionally restricted to http(s) below.
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded">$1</code>');

  const imageLine = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const imageMatch = line.match(imageLine);
    if (imageMatch) {
      flush();
      const [, alt, src] = imageMatch;
      out.push(
        `<figure class="my-5">` +
          `<img src="${escape(src)}" alt="${escape(alt)}" loading="lazy" class="w-full rounded-lg border shadow-sm" />` +
          (alt ? `<figcaption class="text-xs text-muted-foreground text-center mt-2">${inline(alt)}</figcaption>` : '') +
          `</figure>`
      );
    } else if (/^##\s+/.test(line)) {
      flush();
      out.push(`<h2 class="text-2xl font-semibold mt-8 mb-3">${inline(line.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^###\s+/.test(line)) {
      flush();
      out.push(`<h3 class="text-lg font-semibold mt-6 mb-2">${inline(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^>\s+/.test(line)) {
      flush();
      out.push(`<blockquote class="border-l-4 border-amber-400 bg-amber-50 px-4 py-2 my-3 text-sm rounded">${inline(line.replace(/^>\s+/, ''))}</blockquote>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        flush();
        out.push('<ul class="list-disc list-inside my-3 space-y-1">');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inOL) {
        flush();
        out.push('<ol class="list-decimal list-inside my-3 space-y-1">');
        inOL = true;
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
    } else if (line.trim() === '') {
      flush();
      out.push('');
    } else {
      flush();
      out.push(`<p class="my-2">${inline(line)}</p>`);
    }
  }
  flush();
  return out.join('\n');
}

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<null | 'helpful' | 'not_helpful'>(null);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/help/articles/${slug}`);
        if (!res.ok) {
          setArticle(null);
          return;
        }
        const data = await res.json();
        setArticle(data.article);
        setRelated(data.related || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const sendFeedback = async (action: 'helpful' | 'not_helpful') => {
    if (feedback) return;
    setFeedback(action);
    try {
      await fetch(`/api/help/articles/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      toast.success('Obrigado pelo feedback!');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</div>;
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Artigo não encontrado</h1>
        <Link href="/ajuda" className="text-blue-600 hover:underline">
          Voltar para a central de ajuda
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/40 to-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/ajuda" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Central de Ajuda
        </Link>
        <div className="mb-2">
          <Link
            href={`/ajuda/categoria/${article.category.slug}`}
            className="text-xs uppercase tracking-wider text-blue-600 font-medium"
          >
            {article.category.name}
          </Link>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">{article.title}</h1>
        {article.summary && <p className="text-lg text-muted-foreground mb-6">{article.summary}</p>}

        <article
          className="prose prose-sm sm:prose-base max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
        />

        <Card className="mt-10">
          <CardContent className="p-5 text-center">
            <p className="text-sm font-medium mb-3">Este artigo foi útil?</p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant={feedback === 'helpful' ? 'default' : 'outline'}
                size="sm"
                onClick={() => sendFeedback('helpful')}
                disabled={!!feedback}
              >
                <ThumbsUp className="w-4 h-4 mr-1" /> Sim ({article.helpful})
              </Button>
              <Button
                variant={feedback === 'not_helpful' ? 'default' : 'outline'}
                size="sm"
                onClick={() => sendFeedback('not_helpful')}
                disabled={!!feedback}
              >
                <ThumbsDown className="w-4 h-4 mr-1" /> Não ({article.notHelpful})
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Não resolveu? <Link href="/suporte" className="text-blue-600 hover:underline">Abra um ticket</Link>
            </p>
          </CardContent>
        </Card>

        {related.length > 0 && (
          <section className="mt-10">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Artigos relacionados
            </h3>
            <div className="space-y-2">
              {related.map((r) => (
                <Link key={r.slug} href={`/ajuda/${r.slug}`}>
                  <Card className="hover:shadow-md transition cursor-pointer">
                    <CardContent className="p-4">
                      <div className="font-medium">{r.title}</div>
                      {r.summary && (
                        <div className="text-sm text-muted-foreground mt-1">{r.summary}</div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 text-center py-8 rounded-lg border-2 border-dashed">
          <MessageSquare className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium mb-3">Ainda precisa de ajuda?</p>
          <Link
            href="/suporte"
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Falar com suporte
          </Link>
        </section>
      </div>
    </div>
  );
}
