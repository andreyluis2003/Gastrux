// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurantId } from "@/lib/whatsapp/get-restaurant";

export const dynamic = "force-dynamic";

interface QuickMovementBody {
  ingredientId: string;
  quantity: number;
  movementType: "ENTRY" | "MANUAL_DEDUCTION" | "ADJUSTMENT";
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 400 });
    }

    const body: QuickMovementBody = await request.json();
    const { ingredientId, quantity, movementType, reason } = body;

    if (!ingredientId || quantity === undefined || !movementType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (quantity < 0) {
      return NextResponse.json(
        { error: "Quantity must be positive" },
        { status: 400 }
      );
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
      include: { category: true },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: "Ingredient not found" },
        { status: 404 }
      );
    }

    let stock = await prisma.stock.findUnique({
      where: { ingredientId },
    });

    if (!stock) {
      stock = await prisma.stock.create({
        data: {
          ingredientId,
          restaurantId: ingredient.restaurantId,
          currentQuantity: 0,
        },
      });
    }

    let newQuantity = stock.currentQuantity;
    switch (movementType) {
      case "ENTRY":
        newQuantity += quantity;
        break;
      case "MANUAL_DEDUCTION":
      case "ADJUSTMENT":
        newQuantity = Math.max(0, newQuantity - quantity);
        break;
    }

    const updatedStock = await prisma.stock.update({
      where: { ingredientId },
      data: {
        currentQuantity: newQuantity,
        lastUpdated: new Date(),
      },
      include: { ingredient: true },
    });

    const movement = await prisma.stockMovement.create({
      data: {
        ingredientId,
        restaurantId: ingredient.restaurantId,
        quantity,
        movementType,
        reason: reason || `Inventário rápido: ${movementType}`,
        referenceType: "QUICK_INVENTORY",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: "STOCK_ENTRY",
        entityType: "StockMovement",
        entityId: movement.id,
        changes: JSON.stringify({
          ingredientId,
          quantity,
          movementType,
          reason,
          previousQuantity: stock.currentQuantity,
          newQuantity,
        }),
      },
    });

    if (newQuantity < ingredient.minimumStock && movementType !== "ENTRY") {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          ingredientId,
          type: "LOW_STOCK",
          dismissed: false,
        },
      });

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            restaurantId,
            type: "LOW_STOCK",
            severity: "HIGH",
            title: `Estoque baixo: ${ingredient.name}`,
            message: `O ingrediente ${ingredient.name} atingiu nivel minimo. Qtd: ${newQuantity} ${ingredient.standardUnit}`,
            ingredientId,
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        movement,
        stock: updatedStock,
        previousQuantity: stock.currentQuantity,
        newQuantity,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Quick movement error:", error);
    return NextResponse.json(
      { error: "Erro ao registrar movimentação de estoque. Tente novamente." },
      { status: 500 }
    );
  }
}
