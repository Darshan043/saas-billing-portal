export interface SpinnerProps {
  /** Visual size. Defaults to 'md' (1.5 rem, matching the existing .spinner class). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Animated ring spinner.
 * Uses the existing `.spinner` base class from index.css plus size modifiers
 * from components.css (.spinner-sm, .spinner-lg).
 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClass = size !== 'md' ? `spinner-${size}` : '';
  const classes = ['spinner', sizeClass, className].filter(Boolean).join(' ');

  return <div className={classes} aria-hidden="true" />;
}
