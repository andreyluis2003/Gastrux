// @ts-nocheck
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function convertUnits(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  conversionFactor: number
): number {
  if (fromUnit === toUnit) return quantity;
  
  // Standard conversions
  const conversions: { [key: string]: { [key: string]: number } } = {
    kg: { g: 1000, kg: 1 },
    g: { kg: 0.001, g: 1 },
    l: { ml: 1000, l: 1 },
    ml: { l: 0.001, ml: 1 },
    un: { un: 1 },
  };

  const key1 = fromUnit.toLowerCase();
  const key2 = toUnit.toLowerCase();

  if (conversions[key1]?.[key2]) {
    return quantity * conversions[key1][key2];
  }

  // Use custom conversion factor if provided
  if (conversionFactor !== 1) {
    return quantity * conversionFactor;
  }

  return quantity;
}

export function calculateRecipeCost(
  ingredientQuantity: number,
  ingredientCost: number,
  recipeBaseYield: number,
  portionSize: number
): number {
  const ingredientTotalCost = ingredientQuantity * ingredientCost;
  const portions = recipeBaseYield / portionSize;
  return portions > 0 ? ingredientTotalCost / portions : 0;
}

export function scaleRecipe(
  quantity: number,
  baseYield: number,
  desiredPortions: number
): number {
  if (baseYield === 0) return 0;
  return (quantity / baseYield) * desiredPortions;
}
