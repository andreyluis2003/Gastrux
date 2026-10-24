import { redirect } from 'next/navigation';

// The platform settings screen listed iFood, Rappi and Uber Eats, none of which sent orders (plan 2026-10-23
// api-de-pedidos): until Keeta, 99Food and iFood are connected (parts 2 and 3), the address goes to API de pedidos
export default function OldDeliveryIntegrationsPage() {
  redirect('/admin/integrations/api');
}
