import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('edge function copy of shared/matching', () => {
  it('is in sync (run `pnpm sync:shared` if this fails)', () => {
    const src = 'shared/matching/src';
    const dest = 'supabase/functions/_shared/matching';
    const files = readdirSync(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(readdirSync(dest).sort()).toEqual(files.sort());
    for (const f of files) {
      expect(readFileSync(join(dest, f), 'utf8')).toBe(readFileSync(join(src, f), 'utf8'));
    }
  });
});
