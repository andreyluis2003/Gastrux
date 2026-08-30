'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id?: string;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'ADMIN' | 'CASHIER' | 'COOK';
  active?: boolean;
}

interface UserFormProps {
  initialData?: User;
  isLoading?: boolean;
  onSubmit: (data: User) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
}

const roleOptions = [
  { value: 'OWNER', label: 'Proprietário' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'CASHIER', label: 'Caixa' },
  { value: 'COOK', label: 'Cozinheiro' },
];

export function UserForm({
  initialData,
  isLoading = false,
  onSubmit,
  onCancel,
  isEditing = false,
}: UserFormProps) {
  const [formData, setFormData] = useState<User>({
    email: initialData?.email || '',
    name: initialData?.name || '',
    role: initialData?.role || 'CASHIER',
    active: initialData?.active ?? true,
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.name) {
      newErrors.name = 'Nome é obrigatório';
    }

    if (!isEditing) {
      if (!password) {
        newErrors.password = 'Senha é obrigatória';
      } else if (password.length < 6) {
        newErrors.password = 'Senha deve ter no mínimo 6 caracteres';
      }

      if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Senhas não conferem';
      }
    } else if (password) {
      if (password.length < 6) {
        newErrors.password = 'Senha deve ter no mínimo 6 caracteres';
      }
      if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Senhas não conferem';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        ...(password && { password }),
      };
      await onSubmit(submitData);
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nome */}
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: João Silva"
            className={cn(errors.name && 'border-red-500')}
          />
          {errors.name && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="ex@exemplo.com"
            disabled={isEditing}
            className={cn(errors.email && 'border-red-500')}
          />
          {errors.email && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.email}
            </p>
          )}
          {isEditing && <p className="text-xs text-gray-500">Email não pode ser alterado</p>}
        </div>

        {/* Senha */}
        <div className="space-y-2">
          <Label htmlFor="password">
            {isEditing ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEditing ? 'Deixe em branco para manter a senha atual' : 'Escolha uma senha'}
            className={cn(errors.password && 'border-red-500')}
          />
          {errors.password && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.password}
            </p>
          )}
        </div>

        {/* Confirmar Senha */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar Senha</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirme a senha"
            className={cn(errors.confirmPassword && 'border-red-500')}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Função */}
        <div className="space-y-2">
          <Label htmlFor="role">Função</Label>
          <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as User['role'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="active">Status</Label>
          <Select
            value={formData.active ? 'true' : 'false'}
            onValueChange={(value) => setFormData({ ...formData, active: value === 'true' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ativo</SelectItem>
              <SelectItem value="false">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botões */}
        <div className="flex gap-3 justify-end pt-4">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button disabled={submitting} className="min-w-[120px]">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              'Atualizar'
            ) : (
              'Criar Usuário'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
