"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

interface QuickInventorySearchProps {
  onSelect: (ingredient: Ingredient) => void;
  disabled?: boolean;
}

export function QuickInventorySearch({
  onSelect,
  disabled = false,
}: QuickInventorySearchProps) {
  const [search, setSearch] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [filtered, setFiltered] = useState<Ingredient[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchIngredients = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/ingredients");
        const data = await response.json();
        setIngredients(data);
      } catch (error) {
        console.error("Failed to fetch ingredients:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchIngredients();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered([]);
      setIsOpen(false);
      return;
    }

    const query = search.toLowerCase();
    const results = ingredients.filter(
      (ing) =>
        ing.name.toLowerCase().includes(query) ||
        ing.code.toLowerCase().includes(query)
    );

    setFiltered(results);
    setIsOpen(results.length > 0);
    setSelectedIndex(0);
  }, [search, ingredients]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filtered.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (ingredient: Ingredient) => {
    onSelect(ingredient);
    setSearch("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Buscar insumo por nome ou codigo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          className="pl-10 h-12 text-lg"
          autoComplete="off"
        />
      </div>

      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-2 bg-background border border-input rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {filtered.map((ingredient, index) => (
            <button
              key={ingredient.id}
              onClick={() => handleSelect(ingredient)}
              className={cn(
                "w-full px-4 py-3 text-left border-b last:border-b-0 transition-colors hover:bg-accent",
                index === selectedIndex && "bg-accent"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ingredient.name}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="truncate">COD: {ingredient.code}</span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: ingredient.category.color }}
                    >
                      {ingredient.category.name}
                    </span>
                  </div>
                </div>
                <span className="ml-2 text-sm font-medium text-muted-foreground flex-shrink-0">
                  {ingredient.standardUnit}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {search && !isOpen && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-input rounded-lg shadow-lg z-50 p-4 text-center text-sm text-muted-foreground">
          Nenhum insumo encontrado
        </div>
      )}
    </div>
  );
}
