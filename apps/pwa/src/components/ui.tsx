import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-coral-500 text-white shadow-sm shadow-coral-200 hover:bg-coral-600 disabled:bg-coral-200',
  secondary: 'bg-white text-plum-700 border border-plum-100 hover:bg-plum-50 disabled:text-plum-100',
  ghost: 'text-plum-700 hover:bg-plum-50 disabled:text-plum-100',
  danger: 'bg-white text-coral-600 border border-coral-200 hover:bg-coral-50',
};

export function Button({
  variant = 'primary',
  className = '',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

/**
 * A button that asks for confirmation in place. Native confirm() dialogs are
 * suppressed in some embedded views (they silently return false).
 */
export function ConfirmButton({
  prompt,
  confirmLabel,
  onConfirm,
  variant = 'danger',
  className = '',
  children,
}: {
  prompt: string;
  confirmLabel: string;
  onConfirm: () => unknown;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <Button variant={variant} className={className} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={prompt} className={`col-span-full rounded-2xl bg-coral-50 p-3 ${className}`}>
      <p className="text-sm text-plum-700">{prompt}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="danger"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setAsking(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-coral-500'}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-plum-100/60 ${className}`}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 py-2 ${disabled ? 'opacity-50' : ''}`}>
      <span>
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-coral-500' : 'bg-plum-100'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  small,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border transition ${small ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} font-medium ${
        selected
          ? 'border-coral-500 bg-coral-500 text-white'
          : 'border-plum-100 bg-white text-plum-700 hover:border-coral-200'
      }`}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = 'plum' }: { children: ReactNode; tone?: 'plum' | 'coral' | 'green' }) {
  const tones = {
    plum: 'bg-plum-50 text-plum-700',
    coral: 'bg-coral-50 text-coral-600',
    green: 'bg-emerald-50 text-emerald-700',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body> so animated ancestors (which create stacking contexts) can't trap it under the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-plum-900/40" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-plum-100 sm:hidden" />
        {title && <h2 className="mb-3 text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Header({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: string | (() => void);
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-cream/90 px-4 py-3 backdrop-blur">
      {back &&
        (typeof back === 'string' ? (
          <Link to={back} className="-ml-2 rounded-full p-2 text-plum-700 hover:bg-plum-50" aria-label="Back">
            <ChevronLeft />
          </Link>
        ) : (
          <button onClick={back} className="-ml-2 rounded-full p-2 text-plum-700 hover:bg-plum-50" aria-label="Back">
            <ChevronLeft />
          </button>
        ))}
      <h1 className="flex-1 truncate text-2xl font-semibold">{title}</h1>
      {right}
    </header>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="mb-4 text-5xl">{icon}</div>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 rounded-xl bg-coral-50 px-3 py-2 text-sm text-coral-600">
      {children}
    </p>
  );
}

export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span title="Verified human" className={`inline-flex text-sky-500 ${className}`} aria-label="Verified">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12 2l2.4 1.8 3-.2 1 2.8 2.6 1.6-.7 2.9 1 2.8-2.4 1.9-.4 3-3 .6L13.9 22 12 20.4 9.6 22l-1.6-2.6-3-.6-.4-3L2.2 13.9l1-2.8-.7-2.9L5.1 6.6l1-2.8 3 .2z" />
        <path d="M10.5 15.2l-3-3 1.4-1.4 1.6 1.6 4.6-4.6 1.4 1.4z" fill="white" />
      </svg>
    </span>
  );
}

export function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function HeartIcon({ filled, className = 'h-5 w-5' }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 4 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.3 0 5.7 3.1 4.5 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
    </svg>
  );
}

export function XIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-3xl font-semibold text-coral-500 ${className}`}>
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
      linky
    </span>
  );
}
