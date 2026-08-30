"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowRight,
  Barcode,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { QuickInventorySearch } from "@/components/stock/quick-inventory-search";
import { QuantityInput } from "@/components/stock/quantity-input";
import { RecentMovements } from "@/components/stock/recent-movements";

interface Ingredient {
  id: string;
  name: string;
  code: string;
  standardUnit: string;
  category: {
    name: string;
    color: string;
  };
}

interface QuickMovementState {
  ingredientId?: string;
  ingredientName?: string;
  ingredientUnit?: string;
  quantity: number;
  movementType: "ENTRY" | "MANUAL_DEDUCTION" | "ADJUSTMENT";
}

export default function QuickInventoryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState<number>(0);
  const [movementType, setMovementType] = useState<"ENTRY" | "MANUAL_DEDUCTION" | "ADJUSTMENT">("ENTRY");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [recentAction, setRecentAction] = useState<QuickMovementState | null>(null);

  const canEdit =
    session?.user?.role === "OWNER" || session?.user?.role === "MANAGER";

  const handleSelectIngredient = (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
    setQuantity(0);
  };

  const handleSubmitMovement = useCallback(async () => {
    if (!selectedIngredient || quantity <= 0) {
      toast.error("Selecione um insumo e informe a quantidade");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/stock/quick-movement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: selectedIngredient.id,
          quantity,
          movementType,
          reason: `Inventario rapido - ${movementType}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Falha ao registrar movimentação");
        return;
      }

      const data = await response.json();

      setRecentAction({
        ingredientId: selectedIngredient.id,
        ingredientName: selectedIngredient.name,
        ingredientUnit: selectedIngredient.standardUnit,
        quantity,
        movementType,
      });

      const typeLabel = movementType === "ENTRY" ? "Entrada" : "Saida";
      toast.success(
        `${typeLabel} registrada: ${quantity} ${selectedIngredient.standardUnit} de ${selectedIngredient.name}`
      );

      setSelectedIngredient(null);
      setQuantity(0);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erro ao registrar movimentação");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIngredient, quantity, movementType]);

  const handleRedo = useCallback(() => {
    if (recentAction?.ingredientId) {
      setSelectedIngredient({
        id: recentAction.ingredientId,
        name: recentAction.ingredientName || "",
        code: "",
        standardUnit: recentAction.ingredientUnit || "",
        category: { name: "", color: "" },
      });
      setQuantity(0);
      setRecentAction(null);
    }
  }, [recentAction]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/10 pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/dashboard" label="Voltar" />
              <div>
                <h1 className="text-2xl font-bold">Inventário Rápido</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Registre entradas e saídas rapidamente
                </p>
              </div>
            </div>
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Tabs defaultValue="entrada" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger
              value="entrada"
              onClick={() => {
                setMovementType("ENTRY");
                setSelectedIngredient(null);
                setQuantity(0);
              }}
              className="gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              Entrada
            </TabsTrigger>
            <TabsTrigger
              value="saida"
              onClick={() => {
                setMovementType("MANUAL_DEDUCTION");
                setSelectedIngredient(null);
                setQuantity(0);
              }}
              className="gap-2"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              Saida
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entrada" className="space-y-4">
            <Card className="p-6 space-y-4">
              {/* Search */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Insumo
                </label>
                <QuickInventorySearch
                  onSelect={handleSelectIngredient}
                  disabled={!canEdit}
                />
              </div>

              {/* Selected Ingredient Card */}
              {selectedIngredient && (
                <Card className="p-4 bg-muted/50 border-primary/20">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{selectedIngredient.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        COD: {selectedIngredient.code}
                      </p>
                      <span
                        className="inline-block mt-2 px-2 py-1 rounded text-xs font-medium text-white"
                        style={{
                          backgroundColor: selectedIngredient.category.color,
                        }}
                      >
                        {selectedIngredient.category.name}
                      </span>
                    </div>
                    <Barcode className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Card>
              )}

              {/* Quantity Input */}
              {selectedIngredient && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-3 block">
                    Quantidade
                  </label>
                  <QuantityInput
                    value={quantity}
                    onChange={setQuantity}
                    unit={selectedIngredient.standardUnit}
                    min={0}
                    step={0.1}
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                onClick={handleSubmitMovement}
                disabled={!selectedIngredient || quantity <= 0 || isSubmitting || !canEdit}
                size="lg"
                className="w-full h-12 text-base font-semibold gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Registrar Entrada
                  </>
                )}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="saida" className="space-y-4">
            <Card className="p-6 space-y-4">
              {/* Search */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Insumo
                </label>
                <QuickInventorySearch
                  onSelect={handleSelectIngredient}
                  disabled={!canEdit}
                />
              </div>

              {/* Selected Ingredient Card */}
              {selectedIngredient && (
                <Card className="p-4 bg-muted/50 border-destructive/20">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{selectedIngredient.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        COD: {selectedIngredient.code}
                      </p>
                      <span
                        className="inline-block mt-2 px-2 py-1 rounded text-xs font-medium text-white"
                        style={{
                          backgroundColor: selectedIngredient.category.color,
                        }}
                      >
                        {selectedIngredient.category.name}
                      </span>
                    </div>
                    <Barcode className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Card>
              )}

              {/* Quantity Input */}
              {selectedIngredient && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-3 block">
                    Quantidade
                  </label>
                  <QuantityInput
                    value={quantity}
                    onChange={setQuantity}
                    unit={selectedIngredient.standardUnit}
                    min={0}
                    step={0.1}
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                onClick={handleSubmitMovement}
                disabled={!selectedIngredient || quantity <= 0 || isSubmitting || !canEdit}
                size="lg"
                className="w-full h-12 text-base font-semibold gap-2"
                variant="destructive"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Registrar Saida
                  </>
                )}
              </Button>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent Action Card */}
        {recentAction && (
          <div className="mt-6 animate-in slide-in-from-bottom-4 duration-300">
            <Card className="p-4 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">
                      Movimentação registrada com sucesso
                    </p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-200">
                      {recentAction.quantity} {recentAction.ingredientUnit} de{" "}
                      {recentAction.ingredientName}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                >
                  Registrar Outra
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Recent Movements */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Últimas Movimentações
          </h2>
          <RecentMovements refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}
