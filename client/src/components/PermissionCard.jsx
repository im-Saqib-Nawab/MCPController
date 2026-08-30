import { SCOPE_OPTIONS } from '../lib/scopes.js';

export default function PermissionCard({ scopes = [], editable = false, onToggle }) {
  return (
    <ul className="grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
      {SCOPE_OPTIONS.map((scope) => {
        const granted = scopes.includes(scope.value);
        return (
          <li key={scope.value} className="flex items-center gap-2">
            {editable ? (
              <input
                type="checkbox"
                checked={granted}
                onChange={() => onToggle?.(scope.value)}
              />
            ) : (
              <span className={granted ? 'text-emerald-600' : 'text-slate-400'}>
                {granted ? '✓' : '✗'}
              </span>
            )}
            {scope.label}
          </li>
        );
      })}
    </ul>
  );
}
