import { NAV_GROUPS } from '@/lib/navigation/app-nav';
import { TUTORIALS } from '@/lib/tutorials/catalog';

/** Where a screen is in the menu ("Grupo > Item"), from the same menu the person sees */
function menuPath(href: string): string {
  for (const g of NAV_GROUPS) {
    const link = g.links.find((l) => l.href.split('#')[0] === href);
    if (link) return g.links.length === 1 ? link.label : `${g.label} > ${link.label}`;
  }
  return href;
}

/** Knowledge: the published tutorial videos (spec 2026-10-25 tutoriais-em-video), built from the catalog */
export default `## Vídeos tutoriais publicados
Quando perguntarem como usar uma destas telas, explique e indique o vídeo pelo nome (em Vídeos tutoriais, ou o botão "Vídeo desta tela" na própria tela):
${TUTORIALS.filter((t) => t.published)
  .map((t) => `- "${t.title}" (${menuPath(t.routes[0])}): ${t.summary}`)
  .join('\n')}`;
