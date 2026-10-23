import { useEffect, useId, useRef, useState } from 'react';
import { searchPlaces, type Place } from '../../lib/cities';

/** City field with suggestions; picking one also sets an approximate location. */
export function CitySearch({
  id,
  value,
  onChange,
  onPick,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
}) {
  const listId = useId();
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      void searchPlaces(value).then((r) => {
        if (n === seq.current) {
          setResults(r);
          setActive(0);
        }
      });
    }, 120);
    return () => clearTimeout(t);
  }, [value, open]);

  function pick(p: Place) {
    onChange(p.label);
    onPick(p);
    setOpen(false);
    setResults([]);
  }

  const show = open && results.length > 0;
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder="Start typing your city"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') pick(results[active]);
          else if (e.key === 'Escape') setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {show && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl bg-white py-1 shadow-lg ring-1 ring-plum-100">
          {results.map((p, i) => (
            <li
              key={`${p.label}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`cursor-pointer px-4 py-2.5 text-[15px] ${i === active ? 'bg-plum-50' : ''}`}
            >
              {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
