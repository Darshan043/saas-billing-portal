import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  compact?: boolean;
  flush?: boolean;
}

export function Card({
  children,
  compact = false,
  flush = false,
  className = '',
  ...props
}: CardProps) {
  const classes = [
    'card',
    compact ? 'card-compact' : '',
    flush ? 'card-flush' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
