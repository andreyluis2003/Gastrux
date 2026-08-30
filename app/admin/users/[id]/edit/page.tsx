'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { UserForm } from '@/components/admin/user-form';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'ADMIN' | 'CASHIER' | 'COOK';
  active: boolean;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}`);
        if (!response.ok) throw new Error('Erro ao carregar usuário');
        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error('Erro:', error);
        toast.error('Erro ao carregar dados do usuário');
        router.push('/admin/users');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, router]);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao atualizar usuário');
      }

      toast.success('Usuário atualizado com sucesso');
      router.push('/admin/users');
      router.refresh();
    } catch (error) {
      console.error('Erro:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar usuário');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Usuário não encontrado</h1>
        <Link href="/admin/users">
          <Button>Voltar para usuários</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Editar Usuário</h1>
          <p className="text-sm text-gray-600 mt-1">Atualizar informações de {user.name}</p>
        </div>
      </div>

      {/* Form */}
      <UserForm
        initialData={user}
        isEditing={true}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        isLoading={isSubmitting}
      />
    </div>
  );
}
