const CATEGORY_COLORS = {
  'Pain relief': 'bg-rose-50 text-rose-800 border-rose-200',
  'Cold & flu': 'bg-sky-50 text-sky-800 border-sky-200',
  Allergy: 'bg-violet-50 text-violet-800 border-violet-200',
  Digestive: 'bg-amber-50 text-amber-800 border-amber-200',
  'Skin care': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Vitamins: 'bg-lime-50 text-lime-800 border-lime-200',
  'First aid': 'bg-orange-50 text-orange-800 border-orange-200',
  Other: 'bg-slate-50 text-slate-700 border-slate-200'
};

export default function MedicineList({ medicines, showDoctor = false, emptyMessage = 'No medicines listed yet.' }) {
  if (!medicines?.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-4">
      {medicines.map((medicine) => (
        <article key={medicine.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">{medicine.name}</h3>
              {showDoctor && medicine.doctor ? (
                <p className="mt-1 text-sm text-slate-500">
                  {medicine.doctor.name} · {medicine.doctor.specialization}
                </p>
              ) : null}
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[medicine.category] || CATEGORY_COLORS.Other}`}
            >
              {medicine.category}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Commonly used for: </span>
            {medicine.usedFor}
          </p>
          {medicine.careTips ? (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">Care tips: </span>
              {medicine.careTips}
            </p>
          ) : null}
          {medicine.warnings ? (
            <p className="mt-2 text-sm text-amber-800">
              <span className="font-medium">Note: </span>
              {medicine.warnings}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
