import { useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y || 2000, m, 0).getDate();

/**
 * Day / month / year selects: works the same on every phone, unlike date inputs.
 * Only dates at least 18 years ago can be picked, so under-18 dates never appear.
 */
export function BirthdayPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [y0, m0, d0] = value ? value.split('-').map(Number) : [0, 0, 0];
  const [parts, setParts] = useState({ y: y0, m: m0, d: d0 });
  const now = new Date();
  const latest = { y: now.getFullYear() - 18, m: now.getMonth() + 1, d: now.getDate() };
  const years = Array.from({ length: 83 }, (_, i) => latest.y - i);
  const maxMonth = parts.y === latest.y ? latest.m : 12;
  const maxDay = Math.min(daysIn(parts.y, parts.m || 1), parts.y === latest.y && parts.m === latest.m ? latest.d : 31);

  function set(next: Partial<typeof parts>) {
    const p = { ...parts, ...next };
    if (p.y === latest.y && p.m > latest.m) p.m = 0;
    if (p.d && p.m && p.d > daysIn(p.y, p.m)) p.d = daysIn(p.y, p.m);
    if (p.d && p.y === latest.y && p.m === latest.m && p.d > latest.d) p.d = 0;
    setParts(p);
    onChange(p.y && p.m && p.d ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : '');
  }

  return (
    <fieldset className="grid grid-cols-[1fr_2fr_1.4fr] gap-2">
      <legend className="sr-only">Birthday</legend>
      <select aria-label="Birth day" value={parts.d || ''} onChange={(e) => set({ d: Number(e.target.value) })}>
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => (
          <option key={i} value={i + 1}>{i + 1}</option>
        ))}
      </select>
      <select aria-label="Birth month" value={parts.m || ''} onChange={(e) => set({ m: Number(e.target.value) })}>
        <option value="">Month</option>
        {MONTHS.slice(0, maxMonth).map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <select aria-label="Birth year" value={parts.y || ''} onChange={(e) => set({ y: Number(e.target.value) })}>
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </fieldset>
  );
}
