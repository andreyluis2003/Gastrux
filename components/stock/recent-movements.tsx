"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Clock, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatQuantity } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Movement {
  id: string;
  ingredientId: string;
  quantity: number;
  movementType: string;
  reason?: string;
  createdAt: Date;
  ingredient: {
    id: string;
    name: string;
    code: string;
    standardUnit: string;
    category: {
      name: string;
      color: string;
    };
  };
}

interface RecentMovementsProps {
  refreshTrigger?: number;
}

export function RecentMovements({ refreshTrigger = 0 }: RecentMovementsProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMovements = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/stock/recent-movements");
        const data = await response.json();
        setMovements(data.movements || []);
      } catch (error) {
        console.error("Failed to fetch movements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovements();
  }, [refreshTrigger]);

  const getMovementIcon = (type: string) => {
    if (type === "ENTRY") {
      return <ArrowDown className="h-5 w-5 text-emerald-500" />;
    }
    return <ArrowUp className="h-5 w-5 text-red-500" />;
  };

  const getMovementLabel = (type: string) => {
    const labels: Record<string, string> = {
      ENTRY: "Entrada",
      MANUAL_DEDUCTION: "Saida Manual",
      ADJUSTMENT: "Ajuste",
    };
    return labels[type] || type;
  };

  const getMovementColor = (type: string) => {
    if (type === "ENTRY") {
      return "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800";
    }
    return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}m atras`;
    if (hours < 24) return `${hours}h atras`;
    return `${days}d atras`;
  };

  if (loading && movements.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 bg-muted rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {movements.map((movement) => (
        <Card
          key={movement.id}
          className={cn(
            "p-4 border-l-4 transition-all hover:shadow-md",
            getMovementColor(movement.movementType)
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              {getMovementIcon(movement.movementType)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-medium truncate">{movement.ingredient.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {getMovementLabel(movement.movementType)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className={cn(
                      "text-lg font-bold",
                      movement.movementType === "ENTRY"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {movement.movementType === "ENTRY" ? "+" : "-"}
                    {formatQuantity(movement.quantity, movement.ingredient.standardUnit)}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium" style={{ backgroundColor: movement.ingredient.category.color }}>
                  {movement.ingredient.category.name}
                </span>
                <span>{getTimeAgo(new Date(movement.createdAt))}</span>
              </div>

              {movement.reason && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {movement.reason}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
