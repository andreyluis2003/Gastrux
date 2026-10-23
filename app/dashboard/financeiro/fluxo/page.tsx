import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner: fix the Financeiro screen): its manual entries reached neither the Caixa nor the DRE.
// Money in and out is in the Caixa (Histórico de caixas) and in Contas a pagar
export default function OldCashFlowPage() {
  redirect('/caixa/historico');
}
