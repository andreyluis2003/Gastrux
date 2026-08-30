// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface OCRExtractionRequest {
  invoiceId: string;
  imageBase64: string;
  fileName: string;
}

interface ExtractedInvoiceData {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  notes: string;
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

    const body: OCRExtractionRequest = await request.json();
    const { invoiceId, imageBase64, fileName } = body;

    if (!invoiceId || !imageBase64) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Update invoice status to PROCESSING
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "PROCESSING" },
    });

    // Call LLM API for OCR and extraction
    const startTime = Date.now();
    const response = await fetch(
      "https://apps.abacus.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analise esta nota fiscal/comprovante de compra e extraia as seguintes informações em JSON:

{
  "supplierName": "Nome do fornecedor/empresa",
  "invoiceNumber": "Numero da nota/cupom",
  "invoiceDate": "Data em formato YYYY-MM-DD",
  "totalAmount": numero_total,
  "items": [
    {
      "description": "Nome do produto/insumo",
      "quantity": quantidade,
      "unit": "kg, g, ml, l, un (ou outro)",
      "unitPrice": preco_unitario,
      "totalPrice": preco_total
    }
  ],
  "notes": "Observações adicionais"
}

Retorne APENAS JSON válido, sem formatação markdown ou explicações.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("LLM API error:", error);
      
      // Update invoice status to FAILED
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        { error: "OCR processing failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const processingTime = Date.now() - startTime;
    const rawText = data.choices[0]?.message?.content || "";

    let extractedData: ExtractedInvoiceData;
    try {
      extractedData = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse LLM response:", rawText);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "FAILED" },
      });
      return NextResponse.json(
        { error: "Failed to parse OCR result" },
        { status: 500 }
      );
    }

    // Parse invoice date
    let invoiceDateObj: Date | null = null;
    if (extractedData.invoiceDate) {
      invoiceDateObj = new Date(extractedData.invoiceDate);
      if (isNaN(invoiceDateObj.getTime())) {
        invoiceDateObj = null;
      }
    }

    // Update invoice with extracted data
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        supplierName: extractedData.supplierName || null,
        invoiceNumber: extractedData.invoiceNumber || null,
        invoiceDate: invoiceDateObj,
        totalAmount: extractedData.totalAmount || null,
        notes: extractedData.notes || null,
        status: "COMPLETED",
        processedAt: new Date(),
        isProcessed: true,
      },
    });

    // Create OCR result record
    await prisma.invoiceOCRResult.create({
      data: {
        invoiceId,
        rawText,
        extractedJSON: JSON.stringify(extractedData),
        confidence: 0.85, // Default confidence
        processingTime,
        modelUsed: "gpt-5.4-mini",
      },
    });

    // Create invoice items
    if (extractedData.items && Array.isArray(extractedData.items)) {
      for (const item of extractedData.items) {
        // Try to match with existing ingredient
        const matchedIngredient = await prisma.ingredient.findFirst({
          where: {
            OR: [
              {
                name: {
                  contains: item.description.split(' ')[0],
                  mode: "insensitive",
                },
              },
            ],
          },
        });

        await prisma.invoiceItem.create({
          data: {
            invoiceId,
            ingredientId: matchedIngredient?.id || null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            matched: !!matchedIngredient,
          },
        });
      }
    }

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: "CREATE",
        entityType: "Invoice",
        entityId: invoiceId,
        changes: JSON.stringify({
          fileName,
          supplierName: extractedData.supplierName,
          invoiceNumber: extractedData.invoiceNumber,
          itemsCount: extractedData.items?.length || 0,
        }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        invoice: updatedInvoice,
        extractedData,
        processingTime,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("OCR processing error:", error);
    return NextResponse.json(
      { error: "Failed to process invoice OCR" },
      { status: 500 }
    );
  }
}
