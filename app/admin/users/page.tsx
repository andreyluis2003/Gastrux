import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { UsersTable } from '@/components/admin/users-table';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Usuários | Admin',
  description: 'Gerenciamento de usuários do sistema',
};

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
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
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-600 mt-1">Gerenciar usuários e permissões do sistema</p>
        </div>
        <Link href="/admin/users/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </Link>
      </div>

      {/* Tabela de Usuários */}
      <UsersTable />
    </div>
  );
}
