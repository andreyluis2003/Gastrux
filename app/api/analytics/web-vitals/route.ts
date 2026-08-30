// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST endpoint to receive Web Vitals metrics
 * Logs metrics for monitoring purposes
 */
export async function POST(request: NextRequest) {
  try {
    // Handle both single metric and batch metrics
    let vitalsData;
    
    try {
      vitalsData = await request.json();
    } catch (parseError) {
      // Se falhar em fazer parse, retornar 400 bad request
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Handle single metric format from reportWebVitals
    if (vitalsData.metric && vitalsData.value !== undefined) {
      const formattedValue =
        vitalsData.metric === 'CLS'
          ? vitalsData.value.toFixed(3)
          : Math.round(vitalsData.value);

      const summary = {
        timestamp: vitalsData.timestamp,
        metric: vitalsData.metric,
        value: formattedValue,
        rating: vitalsData.rating || 'unrated',
      };

      if (process.env.NODE_ENV === 'production') {
        console.log('[Web Vitals]', JSON.stringify(summary));
      }

      return NextResponse.json({
        success: true,
        message: 'Web Vital metric recorded',
      });
    }

    // Handle legacy format (full metrics object)
    const summary = {
      timestamp: new Date().toISOString(),
      url: vitalsData.url,
      metrics: {
        lcp: vitalsData.lcp ? `${vitalsData.lcp.value.toFixed(0)}ms (${vitalsData.lcp.rating})` : 'N/A',
        inp: vitalsData.inp ? `${vitalsData.inp.value.toFixed(0)}ms (${vitalsData.inp.rating})` : 'N/A',
        cls: vitalsData.cls ? `${vitalsData.cls.value.toFixed(3)} (${vitalsData.cls.rating})` : 'N/A',
        fcp: vitalsData.fcp ? `${vitalsData.fcp.value.toFixed(0)}ms (${vitalsData.fcp.rating})` : 'N/A',
        ttfb: vitalsData.ttfb ? `${vitalsData.ttfb.value.toFixed(0)}ms (${vitalsData.ttfb.rating})` : 'N/A',
      },
    };

    if (process.env.NODE_ENV === 'production') {
      console.log('[Web Vitals]', JSON.stringify(summary));
    }

    return NextResponse.json({
      success: true,
      message: 'Web Vitals recorded successfully',
    });
  } catch (error) {
    console.error('Error processing web vitals:', error);
    return NextResponse.json(
      { error: 'Failed to process web vitals' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve Web Vitals summary
 * Returns real-time metrics status
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'active',
    message: 'Web Vitals tracking is enabled',
    metrics: {
      lcp: 'Largest Contentful Paint',
      inp: 'Interaction to Next Paint',
      cls: 'Cumulative Layout Shift',
      fcp: 'First Contentful Paint',
      ttfb: 'Time to First Byte',
    },
    documentation: 'Metrics are logged in production. Check server logs for Web Vitals data.',
  });
}
