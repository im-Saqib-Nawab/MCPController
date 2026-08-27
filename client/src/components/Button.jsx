export default function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  const styles = {
    primary:
      'bg-slate-900 text-white hover:bg-slate-800',

    secondary:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',

    danger:
      'border border-red-200 bg-white text-red-700 hover:bg-red-50'
  };

  const variantStyles =
    styles[variant] ||
    styles.primary;

  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center',
        'rounded-lg px-4 py-2.5',
        'text-sm font-medium',
        'transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles,
        className
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}