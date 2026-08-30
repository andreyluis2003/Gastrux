"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

export function QuantityInput({
  value,
  onChange,
  unit,
  step = 0.1,
  min = 0,
  max,
  disabled = false,
  className,
}: QuantityInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleIncrement = () => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(Math.round((newValue + Number.EPSILON) * 1000) / 1000);
    }
  };

  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(Math.round((newValue + Number.EPSILON) * 1000) / 1000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    if (val >= min && (max === undefined || val <= max)) {
      onChange(val);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value < min) {
      onChange(min);
    } else if (max !== undefined && value > max) {
      onChange(max);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-stretch gap-2 bg-background rounded-lg border border-input">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="rounded-none border-r h-12"
        >
          <Minus className="h-5 w-5" />
        </Button>

        <div className="flex-1 flex flex-col items-center justify-center px-2">
          <Input
            type="number"
            value={value}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            disabled={disabled}
            className="text-center text-2xl font-bold h-full border-0 p-0 focus-visible:ring-0 bg-transparent"
            step={step}
            min={min}
            max={max}
          />
        </div>

        <div className="flex items-center px-3 py-2 text-sm font-medium text-muted-foreground border-l">
          {unit}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value >= max)}
          className="rounded-none border-l h-12"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {max !== undefined && value >= max && (
        <div className="text-xs text-amber-600 mt-2">Quantidade maxima atingida</div>
      )}
    </div>
  );
}
