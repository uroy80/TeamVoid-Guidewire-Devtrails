import { useEffect, useRef, useState } from 'react';

/**
 * Theme-aware GigShield logo. Swaps between the standard crest
 * (for light mode) and the washed-white variant (for dark mode)
 * so the shield never disappears on dark glass cards.
 *
 * Watches `document.body.classList` via MutationObserver so the
 * swap is instant on theme toggle, without relying on each consumer
 * to subscribe to a store.
 *
 * If the dark-mode asset is missing we silently fall back to the
 * light logo rendered through a CSS brightness/contrast filter, so
 * the brand never shows broken-image alt text.
 *
 * Drop the dark-mode artwork at:
 *   packages/frontend/public/logos/gigshield-dark.png
 */
interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

const LIGHT_SRC = '/logos/gigshield.png';
const DARK_SRC = '/logos/gigshield-dark.png';

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains('dark');
}

export default function Logo({ className, style, alt = 'GigShield' }: LogoProps) {
  const [isDark, setIsDark] = useState<boolean>(readIsDark);
  const [darkMissing, setDarkMissing] = useState<boolean>(false);
  const triedDarkRef = useRef<boolean>(false);

  useEffect(() => {
    // Re-sync on mount in case the body class was set after initial render.
    setIsDark(readIsDark());

    const observer = new MutationObserver(() => {
      setIsDark(readIsDark());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const useDark = isDark && !darkMissing;
  const src = useDark ? DARK_SRC : LIGHT_SRC;

  // If we're in dark mode but the dark artwork is missing, brighten the
  // light crest so it still reads on dark glass. Once the PNG lands this
  // branch goes away automatically.
  const fallbackFilter =
    isDark && darkMissing ? 'brightness(1.15) drop-shadow(0 0 6px rgba(255,255,255,0.25))' : undefined;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...style, filter: fallbackFilter ?? (style as React.CSSProperties | undefined)?.filter }}
      onError={() => {
        if (useDark && !triedDarkRef.current) {
          // Dark variant 404'd — fall back to the light logo for the rest of the session.
          triedDarkRef.current = true;
          setDarkMissing(true);
        }
      }}
    />
  );
}
