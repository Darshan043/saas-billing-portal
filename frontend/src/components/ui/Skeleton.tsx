import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** CSS width value, e.g. '100%', '8rem'. Defaults to '100%'. */
  width?: string;
  /** CSS height value. Defaults to '1rem'. */
  height?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Single-line shimmer placeholder.
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  /** Number of text-line placeholders to render. Defaults to 3. */
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Multi-line text shimmer placeholder.
 * The last line is narrower (60 %) to simulate a natural paragraph ending.
 */
export function SkeletonText({
  lines = 3,
  className = '',
  style,
}: SkeletonTextProps) {
  return (
    <div
      className={['skeleton-block', className].filter(Boolean).join(' ')}
      style={style}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: '1rem',
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}
