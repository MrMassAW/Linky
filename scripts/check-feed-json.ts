// Runs the shared matcher on JSON produced by matchable_json_many() to prove the SQL
// output and the TS types line up. Used by scripts/test-db.sh.
import { readFileSync } from 'node:fs';
import { buildFeed, type MatchableProfile } from '../shared/matching/src/index.ts';

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')) as MatchableProfile[];
const [viewer, ...candidates] = rows;
const feed = buildFeed(viewer, candidates);
if (candidates.length === 0 || feed.length === 0) throw new Error('expected a non-empty feed');
for (const f of feed) {
  const c = f.compatibility;
  if (!(c.total >= 0 && c.total <= 100) || c.personality === null || c.love_language === null) {
    throw new Error(`bad breakdown for ${f.profile.id}: ${JSON.stringify(c)}`);
  }
}
console.log(`feed ok: ${feed.length}/${candidates.length} candidates, top score ${feed[0].compatibility.total}`);
