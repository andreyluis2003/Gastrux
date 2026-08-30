import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { I18nPageHeader, I18nButton } from '@/components/ui/i18n-page-header';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ReceitasSearchClient } from '@/components/receitas/receitas-search-client';

// Cache strategy: Revalidate recipes every 5 minutes (300 seconds)
// Recipes are master data that doesn't change frequently
export const revalidate = 300;

interface ReceitasPageProps {
  searchParams: {
    search?: string;
    page?: string;
  };
}

// Skeleton loader for recipes grid
function ReceitasLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div 
          key={i} 
          className="p-4 rounded-lg bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800 animate-pulse"
        >
          <div className="h-5 w-40 bg-slate-300 dark:bg-slate-600 rounded mb-2"></div>
          <div className="h-4 w-24 bg-slate-300 dark:bg-slate-600 rounded mb-3"></div>
          <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded"></div>
        </div>
      ))}
    </div>
  );
}

async function ReceitasContent({ search, page }: { search?: string; page?: string }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/signin');
  }

  const pageNum = parseInt(page || '1', 10);
  const pageSize = 20;
  const skip = (pageNum - 1) * pageSize;

  // Build filter
  const whereClause = {
    active: true,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  // Fetch total count and recipes
  const [totalCount, recipes] = await Promise.all([
    prisma.recipe.count({ where: whereClause }),
    prisma.recipe.findMany({
      where: whereClause,
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNextPage = pageNum < totalPages;
  const hasPrevPage = pageNum > 1;

  return (
    <>
      {recipes.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <p className="text-slate-600">
            {search ? 'Nenhuma receita encontrada' : 'Nenhuma receita cadastrada'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <Link key={recipe.id} href={`/receitas/${recipe.id}`}>
                <Card className="cursor-pointer p-4 transition-all hover:shadow-lg h-full">
                  <h3 className="mb-1 font-semibold text-foreground">{recipe.name}</h3>
                  <p className="text-xs text-slate-500 mb-2">{recipe.code}</p>
                  <p className="text-sm text-slate-600">
                    {recipe.ingredients?.length || 0} ingredientes
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              {hasPrevPage && (
                <Link 
                  href={`/receitas?page=${pageNum - 1}${search ? `&search=${search}` : ''}`}
                >
                  <Button variant="outline" size="sm">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </Link>
              )}
              
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === pageNum;
                  
                  if (Math.abs(pageNumber - pageNum) > 2 && pageNumber !== 1 && pageNumber !== totalPages) {
                    return null;
                  }

                  return (
                    <Link 
                      key={pageNumber}
                      href={`/receitas?page=${pageNumber}${search ? `&search=${search}` : ''}`}
                    >
                      <Button 
                        variant={isActive ? 'default' : 'outline'} 
                        size="sm"
                        className="min-w-10"
                      >
                        {pageNumber}
                      </Button>
                    </Link>
                  );
                })}
              </div>

              {hasNextPage && (
                <Link 
                  href={`/receitas?page=${pageNum + 1}${search ? `&search=${search}` : ''}`}
                >
                  <Button variant="outline" size="sm">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              )}
            </div>
          )}

          {/* Results info */}
          <div className="text-center text-sm text-slate-600 mt-4">
            {pageNum > 1 && <p>Página {pageNum} de {totalPages} • {totalCount} receitas no total</p>}
          </div>
        </>
      )}
    </>
  );
}

export default function ReceitasPage({ searchParams }: ReceitasPageProps) {
  const search = searchParams.search || '';

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <I18nPageHeader titleKey="recipes.title" subtitleKey="recipes.subtitle">
        <Link href="/receitas/nova" className="w-full sm:w-auto">
          <I18nButton labelKey="recipes.new" />
        </Link>
      </I18nPageHeader>

      {/* Search Component (Client-side) */}
      <ReceitasSearchClient initialSearch={search} />

      {/* SSR Content with Suspense */}
      <Suspense fallback={<ReceitasLoadingSkeleton />}>
        <ReceitasContent search={search} page={searchParams.page} />
      </Suspense>
    </div>
  );
}
