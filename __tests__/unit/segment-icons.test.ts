import fs from 'fs';
import path from 'path';
import { SEGMENTS } from '@/lib/marketing/segments';

// 2026-10-23: 16 icons named by the segment pages (Calculator, Wallet, QrCode...) were missing from the page's map
// and showed as a star
it('every icon a segment page names is in the page icon map', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/para/[segmento]/segment-client.tsx'), 'utf8');
  const map = src.match(/const ICON_MAP[^{]*\{([\s\S]*?)\};/)?.[1] ?? '';
  const known = new Set(map.split(/[\s,]+/).filter(Boolean));
  const used = new Set(SEGMENTS.flatMap((s: any) => (s.benefits ?? []).map((b: any) => b.icon)));
  expect([...used].filter((i) => !known.has(i)).sort()).toEqual([]);
});
