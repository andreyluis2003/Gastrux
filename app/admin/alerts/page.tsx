import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata = {
  title: 'Alertas - Admin',
  description: 'Gerenciamento de alertas do sistema',
};

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');

  return (
    <div className="p-6 max-w-7xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Alertas do Sistema</h1>
      <p className="text-slate-600 mb-6">Monitoramento e gerenciamento de alertas</p>
      <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
        <p className="text-slate-600">Funcionalidades em desenvolvimento...</p>
      </div>
    </div>
  );
}
