/**
 * Launch checklist f2-admins: review the accounts created by the old staff route.
 *
 * That route (before 2026-09-23) gave every hire the fixed password "temp123" and let the request
 * choose any role, ADMIN included. This script lists:
 *   1. every ADMIN user (platform-level roles: each one must be someone of the team);
 *   2. every active user whose password is still "temp123".
 *
 * Read-only by default. With --apply it only marks the "temp123" accounts so they must change the
 * password at the next access (mustChangePassword = true). It never changes roles: demoting an
 * ADMIN is a decision for a person, from the list printed here.
 *
 * Run: npx tsx --require dotenv/config scripts/audit-staff-accounts.ts [--apply]
 * (DATABASE_URL decides the database: check it points where you mean before --apply.)
 */
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const OLD_FIXED_PASSWORD = 'temp123';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true, email: true, name: true, role: true, active: true, createdAt: true,
        restaurants: { select: { restaurantId: true, role: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`\n== ${admins.length} usuário(s) ADMIN (cada um deve ser da equipe da plataforma) ==`);
    for (const a of admins) {
      const memberships = a.restaurants.map((r) => `${r.restaurantId}:${r.role}${r.isActive ? '' : '(inativo)'}`).join(', ');
      console.log(`- ${a.email} | ${a.role} | ${a.active ? 'ativo' : 'inativo'} | criado ${a.createdAt.toISOString().slice(0, 10)} | vínculos: ${memberships || 'nenhum'}`);
    }

    const candidates = await prisma.user.findMany({
      where: { active: true, password: { not: null } },
      select: { id: true, email: true, role: true, password: true, mustChangePassword: true },
    });
    const weak: typeof candidates = [];
    for (const u of candidates) {
      if (u.password && u.password.startsWith('$2') && (await bcryptjs.compare(OLD_FIXED_PASSWORD, u.password))) weak.push(u);
    }
    console.log(`\n== ${weak.length} conta(s) ativa(s) ainda com a senha fixa antiga ==`);
    for (const u of weak) console.log(`- ${u.email} | ${u.role}${u.mustChangePassword ? ' | já marcada para troca' : ''}`);

    const toMark = weak.filter((u) => !u.mustChangePassword);
    if (!apply) {
      console.log(`\nNada foi alterado. Com --apply, ${toMark.length} conta(s) passam a exigir troca de senha no próximo acesso.`);
      return;
    }
    if (toMark.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: toMark.map((u) => u.id) } }, data: { mustChangePassword: true } });
    }
    console.log(`\n${toMark.length} conta(s) marcada(s) para trocar a senha no próximo acesso. Papéis não foram alterados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
