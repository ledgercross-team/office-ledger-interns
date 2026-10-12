import type { TaskCategory } from './types';

// HR-flavoured tags. `dot` is a Tailwind background class, `chip` the tag's own colours.
export const TASK_CATEGORIES: { value: TaskCategory; label: string; dot: string; chip: string }[] = [
  { value: 'general', label: 'General', dot: 'bg-charcoal/40', chip: 'bg-charcoal/5 text-charcoal-soft' },
  { value: 'onboarding', label: 'Onboarding', dot: 'bg-evergreen', chip: 'bg-mist text-forest' },
  { value: 'recruitment', label: 'Recruitment', dot: 'bg-sky-600', chip: 'bg-sky-50 text-sky-800' },
  { value: 'payroll', label: 'Payroll', dot: 'bg-brand-amber', chip: 'bg-amber-tint text-amber-deep' },
  { value: 'leave_attendance', label: 'Leave & attendance', dot: 'bg-teal-600', chip: 'bg-teal-50 text-teal-800' },
  { value: 'training', label: 'Training', dot: 'bg-violet-600', chip: 'bg-violet-50 text-violet-800' },
  { value: 'performance_review', label: 'Performance review', dot: 'bg-rose-600', chip: 'bg-rose-50 text-rose-800' },
  { value: 'compliance', label: 'Compliance', dot: 'bg-slate-600', chip: 'bg-slate-100 text-slate-800' },
  { value: 'it_support', label: 'IT & equipment', dot: 'bg-indigo-600', chip: 'bg-indigo-50 text-indigo-800' },
];

export function categoryMeta(value: TaskCategory) {
  return TASK_CATEGORIES.find((item) => item.value === value) ?? TASK_CATEGORIES[0];
}
