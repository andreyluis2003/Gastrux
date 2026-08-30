import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuditLogsTable } from '@/components/admin/audit-logs-table';

export const metadata: Metadata = {
  title: 'Logs de Auditoria | Admin',
  description: 'Histórico de ações administrativas do sistema',
};

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  const userRole = (session.user as any)?.role;
  if (!['OWNER', 'MANAGER', 'ADMIN'].includes(userRole)) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Logs de Auditoria</h1>
          <p className="text-sm text-gray-600 mt-1">Histórico de ações administrativas e alterações no sistema</p>
        </div>
      </div>

      {/* Tabela de Logs */}
      <AuditLogsTable />
    </div>
  );
}
