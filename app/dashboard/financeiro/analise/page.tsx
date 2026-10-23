import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner: fix the Financeiro screen): it listed metrics no screen ever wrote, so it was always empty
export default function OldFinancialAnalysisPage() {
  redirect('/dashboard/financeiro');
}
