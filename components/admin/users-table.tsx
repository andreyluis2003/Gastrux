'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Trash2, Edit, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'ADMIN' | 'CASHIER' | 'COOK';
  active: boolean;
  createdAt: Date;
  staffMember?: {
    status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  };
}

interface PaginationData {
  total: number;
  pages: number;
  currentPage: number;
}

interface UsersTableProps {
  onRefresh?: () => void;
}

const roleColors: Record<string, string> = {
  OWNER: 'bg-red-100 text-red-800',
  MANAGER: 'bg-blue-100 text-blue-800',
  ADMIN: 'bg-purple-100 text-purple-800',
  CASHIER: 'bg-green-100 text-green-800',
  COOK: 'bg-amber-100 text-amber-800',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-red-100 text-red-800',
  ON_LEAVE: 'bg-yellow-100 text-yellow-800',
  TERMINATED: 'bg-gray-100 text-gray-800',
};

export function UsersTable({ onRefresh }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    pages: 0,
    currentPage: 1,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; userId?: string; userName?: string }>({
    open: false,
  });
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '10');
      if (search) params.append('search', search);
      if (role !== 'all') params.append('role', role);
      if (status !== 'all') params.append('status', status);

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (!response.ok) throw new Error('Erro ao carregar usuários');

      const data = await response.json();
      setUsers(data.users || []);
      setPagination({
        total: data.pagination?.total || 0,
        pages: data.pagination?.totalPages || 0,
        currentPage: page,
      });
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao deletar usuário');
      }

      toast.success('Usuário deletado com sucesso');
      setDeleteModal({ open: false });
      fetchUsers(pagination.currentPage);
      onRefresh?.();
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao deletar usuário');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/admin/users/export?format=csv');
      if (!response.ok) throw new Error('Erro ao exportar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usuarios-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Usuários exportados com sucesso');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar usuários');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
  }, [search, role, status]);

  if (loading && users.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros e Ações */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as funções</SelectItem>
              <SelectItem value="OWNER">Proprietário</SelectItem>
              <SelectItem value="MANAGER">Gerente</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="CASHIER">Caixa</SelectItem>
              <SelectItem value="COOK">Cozinheiro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleExport}
            disabled={exporting || users.length === 0}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              'Exportar CSV'
            )}
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Nome</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Função</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Criado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs sm:text-sm">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-xs', roleColors[user.role] || 'bg-gray-100')}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          'text-xs',
                          user.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        )}
                      >
                        {user.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/admin/users/${user.id}/edit`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            setDeleteModal({ open: true, userId: user.id, userName: user.name })
                          }
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Deletar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
            <Button
              key={page}
              variant={pagination.currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => fetchUsers(page)}
              disabled={loading}
            >
              {page}
            </Button>
          ))}
        </div>
      )}

      {/* Delete Modal */}
      <AlertDialog open={deleteModal.open} onOpenChange={(open) => setDeleteModal({ ...deleteModal, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o usuário <strong>{deleteModal.userName}</strong>? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteModal.userId && handleDelete(deleteModal.userId)}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deletando...
                </>
              ) : (
                'Deletar'
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
