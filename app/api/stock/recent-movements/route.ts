// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const movements = await prisma.stockMovement.findMany({
      where: {
        restaurantId,
      },
      include: {
        ingredient: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 15,
    });

    return NextResponse.json({ movements }, { status: 200 });
  } catch (error) {
    console.error("Get recent movements error:", error);
    return NextResponse.json(
      { error: "Failed to fetch movements" },
      { status: 500 }
    );
  }
}
