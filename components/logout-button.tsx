'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => signOut({ redirect: true, callbackUrl: '/auth/signin' })}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sair
    </Button>
  );
}
