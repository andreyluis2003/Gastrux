import fs from 'fs';
import path from 'path';
import { NAV_GROUPS } from '@/lib/navigation/app-nav';

/**
 * React's rule of hooks: a hook called after an early `return` in the component body crashes the page as soon as the
 * return stops happening (React error #310). Found on Vendas and Lucratividade (2026-10-23) and on Adicionais (the
 * same day, before it went into the menu). Checks the page of every menu link: no top-level `useX(` after a
 * top-level `if (...) return` of the default export.
 */
const pages = [...new Set(NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href.split('?')[0])))]
  .map((href) => path.join(process.cwd(), 'app', ...href.split('/').filter(Boolean), 'page.tsx'))
  .filter((f) => fs.existsSync(f));

function hookAfterEarlyReturn(source: string): string | null {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^export default (async )?function/.test(l));
  if (start < 0) return null;
  let returned: number | null = null;
  for (let i = start + 1; i < lines.length && !/^}/.test(lines[i]); i++) {
    const l = lines[i];
    if (returned === null && /^ {2}if \(.+\)\s*(return\b|\{)/.test(l)) {
      // `if (x) return …;` or a block that returns at its first level
      if (/return\b/.test(l)) returned = i;
      else for (let j = i + 1; j < lines.length && !/^ {2}}/.test(lines[j]); j++) if (/^ {4}return\b/.test(lines[j])) { returned = i; break; }
      continue;
    }
    if (returned !== null && /^ {2}(const .+= )?use[A-Z]\w*\(/.test(l)) return `line ${i + 1}: ${l.trim()} (after the return on line ${returned + 1})`;
  }
  return null;
}

it('the menu has pages to check', () => {
  expect(pages.length).toBeGreaterThan(40);
});

it.each(pages.map((f) => [path.relative(process.cwd(), f), f]))('%s calls no hook after an early return', (_name, file) => {
  expect(hookAfterEarlyReturn(fs.readFileSync(file, 'utf8'))).toBeNull();
});
