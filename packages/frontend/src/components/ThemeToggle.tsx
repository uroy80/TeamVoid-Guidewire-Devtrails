import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className={`glass w-10 h-10 flex items-center justify-center rounded-xl transition-all ${className}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <i
        className={`${isDark ? 'ri-sun-line text-yellow-400' : 'ri-moon-line text-indigo-500'} text-lg`}
      />
    </button>
  );
}
