export default function PermissionCard({ scopes = [] }) {
  const all = [
    { value: 'doctor:read', label: 'Read doctors' },
    { value: 'doctor:create', label: 'Add/create doctors' },
    { value: 'doctor:update', label: 'Update doctors' },
    { value: 'doctor:delete', label: 'Delete doctors' }
  ];

  return (
    <ul className="space-y-1.5 text-sm text-slate-700">
      {all.map((scope) => {
        const granted = scopes.includes(scope.value);
        return (
          <li key={scope.value} className="flex items-center gap-2">
            <span className={granted ? 'text-emerald-600' : 'text-slate-400'}>
              {granted ? '✓' : '✗'}
            </span>
            {scope.label}
          </li>
        );
      })}
    </ul>
  );
}
