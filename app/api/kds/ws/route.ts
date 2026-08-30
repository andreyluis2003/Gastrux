// @ts-nocheck
// WebSocket endpoint for KDS real-time updates
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// Socket.io uses HTTP upgrade mechanism, so we handle health checks here
export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({ status: 'WebSocket server running' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
