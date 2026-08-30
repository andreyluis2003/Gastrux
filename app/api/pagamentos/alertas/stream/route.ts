// @ts-nocheck
/**
 * /api/pagamentos/alertas/stream  (GET) — Server-Sent Events stream
 *
 * Pushes real-time payment alert events to the client using SSE.
 * Clients consume this via `new EventSource('/api/pagamentos/alertas/stream')`.
 *
 * Events emitted:
 *   event: alert
 *     data: { type: 'alert.created' | 'alert.read' | 'alert.deleted', payload: ... }
 *   event: ping
 *     data: { ts: <epoch-ms> }   (keepalive every 30s)
 *   event: hello
 *     data: { ok: true, ts: <epoch-ms> }  (initial handshake)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subscribeAlertEvents } from '@/lib/payment-alerts-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller closed
        }
      };

      // Initial handshake
      safeEnqueue(formatSSE('hello', { ok: true, ts: Date.now() }));

      // Subscribe to bus events
      unsubscribe = subscribeAlertEvents((event) => {
        safeEnqueue(formatSSE('alert', event));
      });

      // Keep-alive ping every 25s
      pingInterval = setInterval(() => {
        safeEnqueue(formatSSE('ping', { ts: Date.now() }));
      }, 25_000);

      // Client disconnects
      req.signal.addEventListener('abort', () => {
        if (pingInterval) clearInterval(pingInterval);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (pingInterval) clearInterval(pingInterval);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
