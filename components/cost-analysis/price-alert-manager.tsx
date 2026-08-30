'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';

interface PriceAlertManagerProps {
  ingredientId?: string;
}

export function PriceAlertManager({ ingredientId }: PriceAlertManagerProps) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    ingredientId: ingredientId || '',
    supplierId: '',
    maxPrice: '',
    minPrice: '',
    alertType: 'ABOVE_MAX',
  });

  const [ingredients, setIngredients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    fetchAlerts();
    fetchIngredients();
  }, [ingredientId]);

  useEffect(() => {
    if (formData.ingredientId) {
      fetchSuppliersForIngredient(formData.ingredientId);
    }
  }, [formData.ingredientId]);

  const fetchAlerts = async () => {
    try {
      const url = ingredientId
        ? `/api/cost-analysis/price-alerts?ingredientId=${ingredientId}`
        : '/api/cost-analysis/price-alerts';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.data);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  };

  const fetchIngredients = async () => {
    try {
      const res = await fetch('/api/ingredients');
      if (res.ok) {
        const data = await res.json();
        setIngredients(data);
      }
    } catch (error) {
      console.error('Error fetching ingredients:', error);
    }
  };

  const fetchSuppliersForIngredient = async (id: string) => {
    try {
      const res = await fetch(`/api/ingredients/${id}`);
      if (res.ok) {
        const ingredient = await res.json();
        setSuppliers(ingredient.suppliers || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ingredientId) {
      toast.error('Selecione um insumo');
      return;
    }

    if (formData.alertType === 'ABOVE_MAX' && !formData.maxPrice) {
      toast.error('Defina o preço máximo');
      return;
    }

    try {
      const res = await fetch('/api/cost-analysis/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: formData.ingredientId,
          supplierId: formData.supplierId || null,
          maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice) : null,
          minPrice: formData.minPrice ? parseFloat(formData.minPrice) : null,
          alertType: formData.alertType,
        }),
      });

      if (res.ok) {
        toast.success('Alerta de preço criado com sucesso');
        setShowDialog(false);
        fetchAlerts();
        setFormData({
          ingredientId: ingredientId || '',
          supplierId: '',
          maxPrice: '',
          minPrice: '',
          alertType: 'ABOVE_MAX',
        });
      } else {
        toast.error('Erro ao criar alerta');
      }
    } catch (error) {
      console.error('Error creating alert:', error);
      toast.error('Erro ao criar alerta');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      const res = await fetch(`/api/cost-analysis/price-alerts/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Alerta removido com sucesso');
        fetchAlerts();
      } else {
        toast.error('Erro ao remover alerta');
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
      toast.error('Erro ao remover alerta');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Alertas de Preço</CardTitle>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Alerta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Alerta de Preço</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAlert} className="flex flex-col gap-4">
              <div>
                <Label>Insumo *</Label>
                <Select
                  value={formData.ingredientId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, ingredientId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar insumo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name} ({ing.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Fornecedor (Opcional)</Label>
                <Select
                  value={formData.supplierId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, supplierId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os fornecedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      Todos os fornecedores
                    </SelectItem>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.supplierName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de Alerta *</Label>
                <Select
                  value={formData.alertType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, alertType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ABOVE_MAX">Acima do Máximo</SelectItem>
                    <SelectItem value="BELOW_MIN">Abaixo do Mínimo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.alertType === 'ABOVE_MAX' && (
                <div>
                  <Label>Preço Máximo Aceitável (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.maxPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, maxPrice: e.target.value })
                    }
                    placeholder="0,00"
                  />
                </div>
              )}

              {formData.alertType === 'BELOW_MIN' && (
                <div>
                  <Label>Preço Mínimo Aceitável (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.minPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, minPrice: e.target.value })
                    }
                    placeholder="0,00"
                  />
                </div>
              )}

              <Button type="submit" className="w-full">
                Criar Alerta
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Carregando alertas...
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <AlertTriangle className="w-8 h-8" />
            <p>Nenhum alerta configurado</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Insumo</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div>
                        <div>{alert.ingredient?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {alert.ingredient?.code}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {alert.supplier?.supplierName || 'Todos'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {alert.alertType === 'ABOVE_MAX'
                          ? 'Acima do Máx'
                          : 'Abaixo do Mín'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {alert.alertType === 'ABOVE_MAX'
                        ? formatBRL(alert.maxPrice)
                        : formatBRL(alert.minPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={alert.enabled ? 'default' : 'secondary'}
                      >
                        {alert.enabled ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
