import { useEffect, useState } from 'react';

/**
 * Theme-aware GigShield logo. Swaps between the standard crest
 * (for light mode) and the washed-white variant (for dark mode)
 * so the shield never disappears on the glass cards.
 *
 * Watches `document.body.classList` via MutationObserver so the
 * swap is instant on theme toggle, without relying on each consumer
 * to subscribe to a store.
 *
 * Save the dark-mode artwork at:
 *   packages/frontend/public/logos/gigshield-dark.png
 */
interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains('dark');
}

export default function Logo({ className, style, alt = 'GigShield' }: LogoProps) {
  const [isDark, setIsDark] = useState<boolean>(readIsDark);

  useEffect(() => {
    // Re-sync on mount in case body class was set after initial render.
    setIsDark(readIsDark());

    const observer = new MutationObserver(() => {
      setIsDark(readIsDark());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const src = isDark ? '/logos/gigshield-dark.png' : '/logos/gigshield.png';
  return <img src={src} alt={alt} className={className} style={style} />;
}
