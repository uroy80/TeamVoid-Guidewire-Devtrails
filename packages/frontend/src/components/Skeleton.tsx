import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
}

export function Skeleton({ className = '', style, width, height, rounded = 8 }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        background: 'var(--bg-secondary)',
        backgroundImage:
          'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary, var(--bg-card)) 50%, var(--bg-secondary) 100%)',
        backgroundSize: '200% 100%',
        width: width ?? '100%',
        height: height ?? 16,
        borderRadius: rounded,
        ...style,
      }}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '70%' : '100%'}
          rounded={6}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`p-5 rounded-xl ${className}`}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <Skeleton width={40} height={40} rounded={10} />
        <div className="flex-1">
          <Skeleton width="60%" height={12} rounded={6} />
          <div className="h-2" />
          <Skeleton width="40%" height={10} rounded={5} />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export default Skeleton;
