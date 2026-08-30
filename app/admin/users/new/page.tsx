'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { UserForm } from '@/components/admin/user-form';
import { toast } from 'sonner';

export default function NewUserPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao criar usuário');
      }

      toast.success('Usuário criado com sucesso');
      router.push('/admin/users');
      router.refresh();
    } catch (error) {
      console.error('Erro:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar usuário');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Novo Usuário</h1>
          <p className="text-sm text-gray-600 mt-1">Criar novo usuário no sistema</p>
        </div>
      </div>

      {/* Form */}
      <UserForm
        isEditing={false}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        isLoading={isSubmitting}
      />
    </div>
  );
}
