import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';

interface Props {
  className?: string;
}

export default function LanguageSwitcher({ className = '' }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const handleSelect = (code: string) => {
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem('gigshield_lang', code);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Change language"
        title={current.label}
        className="glass w-10 h-10 flex items-center justify-center rounded-xl transition-all"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
      >
        <i className="ri-global-line text-lg" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 w-44 rounded-xl shadow-lg z-50 py-1"
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === current.code;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(lang.code)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:opacity-80"
                  style={{
                    color: 'var(--text-primary)',
                    background: active ? 'var(--bg-tertiary, var(--bg-card))' : 'transparent',
                  }}
                >
                  <span>{lang.label}</span>
                  {active && <i className="ri-check-line text-sm" style={{ color: 'var(--accent)' }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
