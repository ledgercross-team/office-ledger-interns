import { CalendarDays } from 'lucide-react';
import { Badge, StatusPill } from './badge';
import { FLAGS, PERFORMANCE_BANDS, URGENCIES, WORKLOADS, type SemanticTone } from '@/lib/hrms/status-vocabulary';

export function WorkloadChip({ level, detail, onLeaveUntil }: { level: keyof typeof WORKLOADS; detail?: string; onLeaveUntil?: string | null }) {
  const status = WORKLOADS[level];
  return <span className="inline-flex flex-wrap items-center gap-1.5"><StatusPill status={status} />{detail && <span className="text-xs text-fg-muted">{detail}</span>}{onLeaveUntil && <LeaveTag label={`On leave until ${onLeaveUntil}`} />}</span>;
}
export function ScoreBadge({ score, band, trend, isNew, ratingCount }: { score: number | null; band?: keyof typeof PERFORMANCE_BANDS; trend?: number | null; isNew?: boolean; ratingCount?: number }) {
  const key: keyof typeof PERFORMANCE_BANDS = isNew ? 'new' : !ratingCount ? 'no_ratings' : band ?? 'good';
  const status = PERFORMANCE_BANDS[key];
  return <Badge tone={status.tone} icon={<status.icon aria-hidden className="size-3.5" />}><span className="tabular-nums">{score === null ? '—' : `${Math.round(score)} / 100`}</span><span>{status.label}</span>{trend !== null && trend !== undefined && <span role="img" aria-label={`${trend >= 0 ? 'Up' : 'Down'} ${Math.abs(trend)} points`}>{trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}</span>}</Badge>;
}
export function UrgencyTag({ urgency }: { urgency: keyof typeof URGENCIES }) { return <StatusPill status={URGENCIES[urgency]} />; }
export function FlagTag({ flag }: { flag: keyof typeof FLAGS }) { return <StatusPill status={FLAGS[flag]} />; }
export function LeaveTag({ label = 'On leave', tone = 'info' }: { label?: string; tone?: SemanticTone }) { return <Badge tone={tone} icon={<CalendarDays aria-hidden className="size-3.5" />}>{label}</Badge>; }
