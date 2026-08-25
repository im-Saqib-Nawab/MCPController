export default function PermissionCard({ scopes = [] }) {
  const all = [
    { value: 'read', label: 'Read' },
    { value: 'write', label: 'Write' },
    { value: 'delete', label: 'Delete' }
  ];
  return (
    <ul className="space-y-1.5 text-sm text-slate-700">
      {all.map((scope) => {
        const granted = scopes.includes(scope.value);
        return (
          <li key={scope.value} className="flex items-center gap-2">
            <span className={granted ? 'text-emerald-600' : 'text-slate-400'}>
              {granted ? '✓' : '–'}
            </span>
            {scope.label}
          </li>
        );
      })}
    </ul>
  );
}
