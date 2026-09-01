export const MEDICINE_FEATURE_KEY = 'medicine_health_tips';

export const MEDICINE_CATEGORIES = [
  'Pain relief',
  'Cold & flu',
  'Allergy',
  'Digestive',
  'Skin care',
  'Vitamins',
  'First aid',
  'Other'
];

export const DOCTOR_ACCESS_MODES = ['all', 'specific', 'percentage'];

export const FEATURE_FLAG_DEFAULTS = {
  key: MEDICINE_FEATURE_KEY,
  name: 'Medicine & Health Tips',
  description:
    'Doctors can add and manage medicines with common uses and simple care tips. Patients can view them when the administrator allows it.',
  enabled: false,
  doctorAccess: 'all',
  doctorIds: [],
  percentage: 0,
  patientsEnabled: false
};
