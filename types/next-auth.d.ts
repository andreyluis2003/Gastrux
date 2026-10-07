import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: string;
      /** Gastrux team (sees the Plataforma menu); same rule as the middleware */
      isPlatformAdmin?: boolean;
      // Add custom fields here
    } & DefaultSession['user']; // includes name, email, image
  }

  interface User extends DefaultUser {
    id: string;
    role?: string;
    // Mirror any fields added to Session['user'] above
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: string;
  }
}
