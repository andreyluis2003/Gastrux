'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/formatters';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SupplierComparisonProps {
  data: any;
  loading?: boolean;
}

export function SupplierComparison({ data, loading }: SupplierComparisonProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparação de Fornecedores</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          Carregando dados...
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.suppliers || data.suppliers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparação de Fornecedores</CardTitle>
        </CardHeader>
        <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
          Nenhum fornecedor encontrado
        </CardContent>
      </Card>
    );
  }

  const chartData = data.suppliers.map((sup: any) => ({
    name: sup.supplierName,
    'Preço Médio': Math.round(sup.avgPrice * 100) / 100,
    'Preço Mínimo': Math.round(sup.minPrice * 100) / 100,
    'Preço Máximo': Math.round(sup.maxPrice * 100) / 100,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Comparação de Fornecedores - {data.ingredient?.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chart">Gráfico</TabsTrigger>
            <TabsTrigger value="table">Tabela</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="w-full">
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis
                    label={{
                      value: 'Preço (R$)',
                      angle: -90,
                      position: 'insideLeft',
                    }}
                  />
                  <Tooltip
                    formatter={(value) => formatBRL(value as number)}
                  />
                  <Legend />
                  <Bar dataKey="Preço Médio" fill="#3b82f6" />
                  <Bar dataKey="Preço Mínimo" fill="#10b981" />
                  <Bar dataKey="Preço Máximo" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="table" className="w-full">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Preço Unitário</TableHead>
                    <TableHead className="text-right">Preço Médio</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Máximo</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.suppliers.map((sup: any) => (
                    <TableRow key={sup.supplierId} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{sup.supplierName}</TableCell>
                      <TableCell className="text-right">
                        {formatBRL(sup.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBRL(sup.avgPrice)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatBRL(sup.minPrice)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatBRL(sup.maxPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {sup.priceChangePercentage > 0 ? (
                            <>
                              <ArrowUp className="w-4 h-4 text-red-500" />
                              <span className="text-red-600 font-semibold">
                                {sup.priceChangePercentage.toFixed(1)}%
                              </span>
                            </>
                          ) : sup.priceChangePercentage < 0 ? (
                            <>
                              <ArrowDown className="w-4 h-4 text-green-500" />
                              <span className="text-green-600 font-semibold">
                                {sup.priceChangePercentage.toFixed(1)}%
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-600">0%</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {sup.totalRecords}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sup.leadDays} dias</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sup.active ? 'default' : 'secondary'}>
                          {sup.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
