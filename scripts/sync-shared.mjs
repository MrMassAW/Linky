// Copies shared/matching into supabase/functions/_shared/matching so Edge Functions
// (which bundle only files under supabase/functions) use the exact same scoring code.
// Run after changing shared/matching: `pnpm sync:shared`. A unit test checks they match.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared/matching/src');
const dest = join(root, 'supabase/functions/_shared/matching');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (f.endsWith('.ts') && !f.endsWith('.test.ts')) cpSync(join(src, f), join(dest, f));
}
console.log('synced shared/matching -> supabase/functions/_shared/matching');
