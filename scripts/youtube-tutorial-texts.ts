/**
 * Writes the YouTube texts of the tutorial videos (title, description with the steps, chapters when every step is
 * long enough, UTM link, tags, playlist) to Documents/Gastrux/videos/youtube. Run: npx tsx scripts/youtube-tutorial-texts.ts
 */
import fs from 'fs';
import path from 'path';
import { TUTORIALS } from '../lib/tutorials/catalog';

const OUT = 'C:/Users/andre/Documents/Gastrux/videos/youtube';
const TIMING = 'C:/Users/andre/gastrux-videos/public/tutoriais';
const PLAYLIST: Record<string, string> = {
  inicio: 'Gastrux: comece por aqui', vender: 'Gastrux: vender', caixa: 'Gastrux: caixa e pagamentos', cardapio: 'Gastrux: cardápio e produtos',
  estoque: 'Gastrux: estoque e compras', fiscal: 'Gastrux: nota fiscal (NFC-e)', relatorios: 'Gastrux: relatórios', clientes: 'Gastrux: clientes e marketing',
  equipe: 'Gastrux: equipe', mais: 'Gastrux: mais recursos', config: 'Gastrux: configurações',
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

fs.mkdirSync(OUT, { recursive: true });
const published = TUTORIALS.filter((t) => t.published);
const blocks = published.map((t, i) => {
  const timingFile = path.join(TIMING, t.slug, 'timing.json');
  const timing = fs.existsSync(timingFile) ? JSON.parse(fs.readFileSync(timingFile, 'utf8')) : null;
  // YouTube chapters: start at 0:00, at least 3, each at least 10 s
  const steps: { start: number; end: number }[] = timing?.steps ?? [];
  const chapters = steps.length >= 3 && steps.every((s) => s.end - s.start >= 10)
    ? steps.map((s, k) => `${mmss(k === 0 ? 0 : s.start)} ${t.steps[k]?.split(/[.:]/)[0].slice(0, 60) ?? `Passo ${k + 1}`}`).join('\n')
    : null;
  const link = `https://gastrux.com/?utm_source=youtube&utm_medium=organic&utm_campaign=tutoriais&utm_content=${t.slug}`;
  const title = `${t.title} | Gastrux, sistema para restaurante`.slice(0, 100);
  const description = [
    `${t.summary} Neste vídeo, o passo a passo no Gastrux.`,
    '',
    ...t.steps.map((s, k) => `${k + 1}. ${s}`),
    '',
    ...(chapters ? ['Capítulos', chapters, ''] : []),
    `Teste o Gastrux grátis por 30 dias, sem cartão: ${link}`,
    '',
    'Gastrux é o sistema para restaurante, bar, lanchonete e delivery: comanda no celular, cozinha, caixa, estoque, ficha técnica, CMV e NFC-e num lugar só.',
  ].join('\n');
  const tags = ['gastrux', 'sistema para restaurante', 'gestão de restaurante', t.title.toLowerCase(), 'tutorial'].join(', ');
  return [
    `==================== ${i + 1}. ${t.slug} ====================`,
    `Arquivo: ${t.slug}.mp4   Capa: miniaturas/${t.slug}.jpg   Duração: ${mmss(t.durationSec)}`,
    `Playlist: ${PLAYLIST[t.group] ?? 'Gastrux: tutoriais'}`,
    '',
    'TÍTULO',
    title,
    '',
    'DESCRIÇÃO',
    description,
    '',
    'TAGS',
    tags,
    '',
  ].join('\n');
});
fs.writeFileSync(path.join(OUT, 'tutoriais-titulos-e-descricoes.txt'), blocks.join('\n'));
console.log(`${published.length} vídeos -> ${OUT}`);
