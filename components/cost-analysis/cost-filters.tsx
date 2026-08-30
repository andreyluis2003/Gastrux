'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronDown } from 'lucide-react';

interface CostFiltersProps {
  onFiltersChange: (filters: any) => void;
}

export function CostFilters({ onFiltersChange }: CostFiltersProps) {
  const [days, setDays] = useState('30');
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  useEffect(() => {
    // Fetch ingredients
    fetch('/api/ingredients')
      .then((res) => res.json())
      .then((data) => setIngredients(data))
      .catch(console.error);

    // Fetch suppliers from ingredients
    fetch('/api/ingredients')
      .then((res) => res.json())
      .then((data) => {
        const uniqueSuppliers: any = {};
        data.forEach((ing: any) => {
          ing.suppliers?.forEach((sup: any) => {
            if (!uniqueSuppliers[sup.id]) {
              uniqueSuppliers[sup.id] = sup;
            }
          });
        });
        setSuppliers(Object.values(uniqueSuppliers));
      })
      .catch(console.error);
  }, []);

  const handleFilterChange = () => {
    onFiltersChange({
      days: parseInt(days),
      ingredientIds: selectedIngredients,
      supplierIds: selectedSuppliers,
    });
  };

  useEffect(() => {
    handleFilterChange();
  }, [days]);

  const filteredIngredients = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(ingredientSearch.toLowerCase()) ||
    ing.code.toLowerCase().includes(ingredientSearch.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter((sup) =>
    sup.supplierName.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Period Selection */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="days">Período</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 180 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Ingredient Selector */}
        <div className="flex flex-col gap-2">
          <Label>Insumos</Label>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="justify-between">
                <span className="truncate">
                  {selectedIngredients.length > 0
                    ? `${selectedIngredients.length} insumo(s) selecionado(s)`
                    : 'Selecionar insumos'}
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Selecionar Insumos</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="Buscar insumo..."
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                />
                <div className="max-h-96 overflow-y-auto flex flex-col gap-2">
                  {filteredIngredients.map((ing) => (
                    <label key={ing.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIngredients.includes(ing.id)}
                        onChange={(e) => {
                          const newSelection = e.target.checked
                            ? [...selectedIngredients, ing.id]
                            : selectedIngredients.filter((id) => id !== ing.id);
                          setSelectedIngredients(newSelection);
                        }}
                      />
                      <span className="text-sm">
                        {ing.name} ({ing.code})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Supplier Selector */}
        <div className="flex flex-col gap-2">
          <Label>Fornecedores</Label>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="justify-between">
                <span className="truncate">
                  {selectedSuppliers.length > 0
                    ? `${selectedSuppliers.length} fornecedor(es)`
                    : 'Selecionar fornecedores'}
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Selecionar Fornecedores</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="Buscar fornecedor..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                />
                <div className="max-h-96 overflow-y-auto flex flex-col gap-2">
                  {filteredSuppliers.map((sup) => (
                    <label key={sup.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSuppliers.includes(sup.id)}
                        onChange={(e) => {
                          const newSelection = e.target.checked
                            ? [...selectedSuppliers, sup.id]
                            : selectedSuppliers.filter((id) => id !== sup.id);
                          setSelectedSuppliers(newSelection);
                        }}
                      />
                      <span className="text-sm">{sup.supplierName}</span>
                    </label>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter Action Buttons */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setSelectedIngredients([]);
            setSelectedSuppliers([]);
            onFiltersChange({ days: parseInt(days), ingredientIds: [], supplierIds: [] });
          }}
        >
          Limpar Filtros
        </Button>
        <Button
          onClick={() => {
            onFiltersChange({
              days: parseInt(days),
              ingredientIds: selectedIngredients,
              supplierIds: selectedSuppliers,
            });
          }}
        >
          Aplicar Filtros
        </Button>
      </div>
    </div>
  );
}
