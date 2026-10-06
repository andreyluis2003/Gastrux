import { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';

export const metadata = {
  title: 'Admin - Gastrux',
  description: 'Painel administrativo do sistema de gestão de restaurante',
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  // Verificar se o usuário está autenticado
  if (!session) {
    redirect('/auth/signin');
  }

  // Verificar se o usuário tem permissão de admin
  const userRole = (session.user as any)?.role as UserRole;
  const adminRoles: UserRole[] = [UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN];

  if (!adminRoles.includes(userRole)) {
    redirect('/dashboard');
  }

  // The menu comes from the app shell (components/app-shell), the same on every screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
