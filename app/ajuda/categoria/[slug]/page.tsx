import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = await prisma.helpCategory.findUnique({
    where: { slug: params.slug },
    include: {
      articles: {
        where: { published: true },
        orderBy: [{ featured: 'desc' }, { order: 'asc' }, { title: 'asc' }],
      },
    },
  });

  if (!category || !category.visible) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/40 to-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link
          href="/ajuda"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Central de Ajuda
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl sm:text-3xl font-bold">{category.name}</h1>
        </div>
        {category.description && (
          <p className="text-muted-foreground mb-8">{category.description}</p>
        )}

        {category.articles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum artigo nesta categoria ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {category.articles.map((a) => (
              <Link key={a.id} href={`/ajuda/${a.slug}`}>
                <Card className="hover:shadow-md transition cursor-pointer">
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className="flex-1">
                      <div className="font-semibold">{a.title}</div>
                      {a.summary && (
                        <div className="text-sm text-muted-foreground mt-1">{a.summary}</div>
                      )}
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground mt-1" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
