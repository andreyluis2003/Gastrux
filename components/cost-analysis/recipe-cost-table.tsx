'use client';

import { formatBRL, formatQuantity } from '@/lib/formatters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface RecipeCostTableProps {
  data: any[];
  loading?: boolean;
}

export function RecipeCostTable({ data, loading }: RecipeCostTableProps) {
  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center text-muted-foreground">
        Carregando dados...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center text-muted-foreground">
        Nenhuma receita encontrada
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Receita</TableHead>
            <TableHead className="text-right">Rendimento</TableHead>
            <TableHead className="text-right">Custo Total</TableHead>
            <TableHead className="text-right">Custo por Porção</TableHead>
            <TableHead className="text-center">Insumos</TableHead>
            <TableHead className="text-center">Preparo</TableHead>
            <TableHead className="text-center">Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((recipe) => (
            <TableRow key={recipe.recipeId} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                <div>
                  <div className="font-semibold">{recipe.name}</div>
                  <div className="text-xs text-muted-foreground">{recipe.code}</div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end">
                  <div className="font-semibold">
                    {formatQuantity(recipe.baseYield, recipe.yieldUnit)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    por {formatQuantity(recipe.portionSize, recipe.portionUnit)}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatBRL(recipe.totalCost)}
              </TableCell>
              <TableCell className="text-right font-semibold text-emerald-600">
                {formatBRL(recipe.costPerPortion)}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline">{recipe.ingredientCount}</Badge>
              </TableCell>
              <TableCell className="text-center">
                {recipe.prepTimeMinutes > 0 ? (
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{recipe.prepTimeMinutes}min</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="text-xs text-blue-600 hover:underline">
                      Ver
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{recipe.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Código</div>
                          <div className="font-semibold">{recipe.code}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Rendimento</div>
                          <div className="font-semibold">
                            {formatQuantity(recipe.baseYield, recipe.yieldUnit)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Custo Total</div>
                          <div className="font-semibold text-lg">
                            {formatBRL(recipe.totalCost)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Custo/Porção</div>
                          <div className="font-semibold text-lg text-emerald-600">
                            {formatBRL(recipe.costPerPortion)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-3">Insumos ({recipe.ingredientCount})</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Insumo</TableHead>
                                <TableHead className="text-right">Quantidade</TableHead>
                                <TableHead className="text-right">Preço Unit</TableHead>
                                <TableHead className="text-right">Custo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {recipe.ingredientCosts.map((ing: any) => (
                                <TableRow key={ing.ingredientId}>
                                  <TableCell className="font-medium">{ing.name}</TableCell>
                                  <TableCell className="text-right">
                                    {formatQuantity(ing.quantity, ing.unit)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatBRL(ing.price)}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatBRL(ing.cost)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
