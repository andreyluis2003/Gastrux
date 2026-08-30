'use client';

import React, { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/formatters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

interface IngredientCostTableProps {
  data: any[];
  loading?: boolean;
}

// Linha otimizada com React.memo
const IngredientRow = ({ item }: { item: any }) => (
  <TableRow className="hover:bg-muted/50">
    <TableCell className="font-medium">
      <div>
        <div className="font-semibold">{item.name}</div>
        <div className="text-xs text-muted-foreground">{item.code}</div>
      </div>
    </TableCell>
    <TableCell>
      <Badge variant="outline">{item.category}</Badge>
    </TableCell>
    <TableCell className="text-right font-semibold">
      {formatBRL(item.avgPrice)}
    </TableCell>
    <TableCell className="text-right text-sm">
      {formatBRL(item.minPrice)}
    </TableCell>
    <TableCell className="text-right text-sm">
      {formatBRL(item.maxPrice)}
    </TableCell>
    <TableCell className="text-right">
      <div className="flex items-center justify-end gap-1">
        {item.priceChange > 0 ? (
          <>
            <ArrowUp className="w-4 h-4 text-red-500" />
            <span className="text-red-600 font-semibold">
              {item.priceChange.toFixed(1)}%
            </span>
          </>
        ) : item.priceChange < 0 ? (
          <>
            <ArrowDown className="w-4 h-4 text-green-500" />
            <span className="text-green-600 font-semibold">
              {item.priceChange.toFixed(1)}%
            </span>
          </>
        ) : (
          <>
            <Minus className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600 font-semibold">0%</span>
          </>
        )}
      </div>
    </TableCell>
    <TableCell className="text-right text-sm">
      {item.referenceCost > 0 ? formatBRL(item.referenceCost) : '-'}
    </TableCell>
    <TableCell className="text-center">
      {item.priceAboveMax ? (
        <Badge variant="destructive">Acima do limite</Badge>
      ) : item.avgPrice > (item.referenceCost || 0) && item.referenceCost > 0 ? (
        <Badge variant="secondary">Alerta</Badge>
      ) : (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          OK
        </Badge>
      )}
    </TableCell>
    <TableCell className="text-sm">
      {item.suppliers.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.suppliers.slice(0, 2).map((sup: string) => (
            <Badge key={sup} variant="outline" className="text-xs">
              {sup}
            </Badge>
          ))}
          {item.suppliers.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{item.suppliers.length - 2}
            </Badge>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">-</span>
      )}
    </TableCell>
  </TableRow>
);

const MemoizedIngredientRow = React.memo(IngredientRow);

export function IngredientCostTable({ data, loading }: IngredientCostTableProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 50;
  
  // Memoize paginação para evitar recálculos
  const paginatedData = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [data, currentPage]);
  
  const totalPages = useMemo(() => Math.ceil(data.length / itemsPerPage), [data.length]);
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
        Nenhum dado encontrado
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabela otimizada */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Insumo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Preço Médio</TableHead>
              <TableHead className="text-right">Mín.</TableHead>
              <TableHead className="text-right">Máx.</TableHead>
              <TableHead className="text-right">Variação</TableHead>
              <TableHead className="text-right">Ref.</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Fornecedores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((item) => (
              <MemoizedIngredientRow key={item.ingredientId} item={item} />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4">
          <div className="text-sm text-muted-foreground">
            Mostrando {currentPage * itemsPerPage + 1} a{' '}
            {Math.min((currentPage + 1) * itemsPerPage, data.length)} de {data.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2 px-3">
              <span className="text-sm font-medium">
                {currentPage + 1} de {totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
