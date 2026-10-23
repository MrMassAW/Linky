import { useState } from 'react';
import { ageFrom, approximate } from '@linky/matching';
import { Button, ErrorText, Toggle } from '../ui';
import { BirthdayPicker } from './BirthdayPicker';
import { CitySearch } from './CitySearch';
import { nearestPlace } from '../../lib/cities';
import { useMe, useSession } from '../../state/session';

export function BasicsForm({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [name, setName] = useState(me.name);
  const [lastName, setLastName] = useState(me.last_name ?? '');
  const [showLastName, setShowLastName] = useState(me.show_last_name);
  const [birthdate, setBirthdate] = useState(me.birthdate);
  const [city, setCity] = useState(me.city ?? '');
  const [height, setHeight] = useState(me.height_cm ? String(me.height_cm) : '');
  const [location, setLocation] = useState(me.location);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) return setError('Location is not available in this browser.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Snap to ~1 km before it ever leaves this function.
        const point = approximate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocation(point);
        setLocating(false);
        if (!city.trim()) void nearestPlace(point).then((p) => p && setCity(p.label));
      },
      (err) => {
        setError(`Couldn't get your location (${err.message}). You can still type your city.`);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your first name.');
    if (!birthdate) return setError('Add your birthday.');
    if (ageFrom(birthdate) < 18) return setError('You must be 18 or older to use Linky.');
    const h = height ? Number(height) : null;
    if (h !== null && (h < 90 || h > 250)) return setError('Height should be in centimetres (90–250).');
    setBusy(true);
    try {
      await backend.saveProfile({
        name: name.trim().split(/\s+/)[0],
        last_name: lastName.trim() || null,
        show_last_name: showLastName,
        birthdate,
        city: city.trim() || null,
        height_cm: h,
        location: location ?? null,
        // gender is chosen on the next step; the SQL row needs one, default keeps inserts valid
        gender: me.gender,
      });
      await refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="name">First name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
      </div>
      <div>
        <label htmlFor="last-name">Last name (optional)</label>
        <input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={40} autoComplete="family-name" />
        {lastName.trim() && (
          <Toggle checked={showLastName} onChange={setShowLastName} label="Show it to my matches" hint="Never shown in Discover." />
        )}
      </div>
      <div>
        <label>Birthday</label>
        <BirthdayPicker value={birthdate} onChange={setBirthdate} />
        <p className="mt-1 text-xs text-muted">Only your age is shown, never the date.</p>
      </div>
      <div>
        <label htmlFor="city">City or neighbourhood</label>
        <CitySearch
          id="city"
          value={city}
          onChange={setCity}
          onPick={(p) => setLocation(approximate(p.point))}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="secondary" className="!px-4 !py-2 text-sm" busy={locating} onClick={locate}>
            📍 {location ? 'Update location' : 'Use my approximate location'}
          </Button>
          {location && <span className="text-xs text-emerald-700">Location set (rounded to ~1 km)</span>}
        </div>
        <p className="mt-1 text-xs text-muted">Others only ever see a rounded distance like “about 5 km away”.</p>
      </div>
      <div>
        <label htmlFor="h">Height (cm, optional)</label>
        <input id="h" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} placeholder="170" />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" busy={busy}>
        {cta}
      </Button>
    </form>
  );
}
