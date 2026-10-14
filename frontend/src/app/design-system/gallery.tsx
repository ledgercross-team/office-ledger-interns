'use client';

import { Bell, Ellipsis, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar, AvatarStack, Badge, Banner, Breadcrumbs, Button, Card, Checkbox,
  Combobox, CommandPalette, ConfirmDialog, DataTable, DatePicker, DateRangePicker,
  Dialog, Drawer, DropdownMenu, EmptyState, ErrorState, FilterBar, FlagTag, Input,
  LeaveTag, PageHeader, Pagination, Popover, ProgressBar, Radio, ReasonDialog,
  ScoreBadge, SegmentedControl, Select, Skeleton, StatTile, StatusPill, Switch,
  Tabs, Textarea, TimeInput, TimezoneSelect, ToastProvider, Tooltip, UrgencyTag,
  WorkloadChip, useToast, type DataColumn, type DateRangeValue,
} from '@/components/ui';
import { ORG_STATUSES, PROJECT_STATUSES, REQUEST_STATUSES, TASK_STATUSES } from '@/lib/hrms/status-vocabulary';

interface Person { id: string; name: string; role: string; status: string }
const people: Person[] = [
  { id: '1', name: 'Amina Rahman', role: 'Manager', status: 'Active' },
  { id: '2', name: 'Rafi Islam', role: 'Employee', status: 'On leave' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4"><h2 className="text-lg font-semibold text-fg">{title}</h2>{children}</section>;
}

function ToastDemo() {
  const toast = useToast();
  return <div className="flex flex-wrap gap-2"><Button onClick={() => toast({ title: 'Saved', description: 'Your changes are up to date.', tone: 'success' })}>Success toast</Button><Button variant="danger" onClick={() => toast({ title: 'Could not save', description: 'Please try again.', tone: 'error' })}>Error toast</Button><Button variant="secondary" onClick={() => toast({ title: 'Invite sent', tone: 'info', action: { label: 'Undo', onClick: () => undefined } })}>Toast with undo</Button></div>;
}

function ThemeGallery({ theme }: { theme: 'light' }) {
  const [range, setRange] = useState<DateRangeValue>({ start: '2026-10-14', end: '2026-10-16', startHalf: false, endHalf: true });
  const [selected, setSelected] = useState(new Set<string>());
  const [segment, setSegment] = useState('cards');
  const [search, setSearch] = useState('');
  const columns: DataColumn<Person>[] = [
    { id: 'name', header: 'Name', sortable: true, cell: (person) => <span className="font-medium">{person.name}</span> },
    { id: 'role', header: 'Role', cell: (person) => person.role },
    { id: 'status', header: 'Status', cell: (person) => <Badge tone={person.status === 'Active' ? 'success' : 'info'}>{person.status}</Badge> },
  ];
  const scope = 'light';

  return <ToastProvider><div className="theme-light"><div className="space-y-8 rounded-card bg-bg p-4 text-fg sm:p-6" data-testid={`${theme}-gallery`}>
    <PageHeader title="Light theme" description="Every component uses semantic design tokens." breadcrumbs={<Breadcrumbs items={[{ label: 'Design system', href: '/design-system' }, { label: theme }]} />} primaryAction={<Button><Plus aria-hidden className="size-4" />Primary action</Button>} secondaryActions={<Button variant="secondary">Secondary</Button>} />

    <Section title="Buttons and feedback"><div className="flex flex-wrap gap-2"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button size="sm">Small</Button><Button loading>Saving</Button><Button disabled disabledReason="You need permission from a CEO">Disabled</Button><Button iconOnly aria-label="Notifications"><Bell aria-hidden className="size-4" /></Button></div><div className="space-y-2"><Banner title="Information">This is an informational banner.</Banner><Banner tone="warning" title="Seat limit almost reached">You have used 95% of available seats.</Banner><Banner tone="danger" title="Organisation suspended">Only data export and renewal are available.</Banner><Banner tone="success" title="Project completed">The rating window is now open.</Banner></div><ToastDemo /></Section>

    <Section title="Form fields"><div className="grid gap-4 sm:grid-cols-2"><Input label="Full name" placeholder="Amina Rahman" required helperText="Shown to people in your organisation." /><Input label="Email" type="email" defaultValue="invalid" error="Enter a valid email address." /><Input label="Disabled input" disabled defaultValue="Not editable" /><Textarea label="Description" placeholder="Add useful context" /><Select label="Role" defaultValue="employee"><option value="manager">Manager</option><option value="employee">Employee</option></Select><Combobox label="Person" options={people.map((person) => ({ value: person.name, label: person.name }))} placeholder="Search people" /><TimezoneSelect id={`${scope}-timezone`} label="Time zone" defaultValue="Asia/Dhaka" /><TimeInput label="Start time" defaultValue="09:00" timezone="Asia/Dhaka" /></div><div className="grid gap-4 sm:grid-cols-2"><Checkbox label="Send email notification" helperText="The person receives an invite." defaultChecked /><Switch label="Approval required" helperText="A lead or executive must approve tasks." defaultChecked /><Radio label="Location type" defaultValue="online" options={[{ value: 'online', label: 'Online' }, { value: 'office', label: 'In person' }]} /></div></Section>

    <Section title="Dates"><div className="grid gap-4 sm:grid-cols-2"><DatePicker label="Due date" defaultValue="2026-10-20" timezone="Asia/Dhaka" /><DatePicker label="Unavailable date" disabled helperText="Dates use your organisation time zone." /></div><DateRangePicker label="Leave dates" value={range} onChange={setRange} timezone="Asia/Dhaka" required /></Section>

    <Section title="Status and people"><div className="flex flex-wrap gap-2"><StatusPill status={TASK_STATUSES.todo} /><StatusPill status={TASK_STATUSES.in_progress} /><StatusPill status={TASK_STATUSES.in_review} /><StatusPill status={TASK_STATUSES.done} /><StatusPill status={TASK_STATUSES.blocked} /><StatusPill status={TASK_STATUSES.cancelled} /><StatusPill status={REQUEST_STATUSES.pending} /><StatusPill status={PROJECT_STATUSES.completed} /><StatusPill status={ORG_STATUSES.read_only} /><UrgencyTag urgency="high" /><UrgencyTag urgency="medium" /><UrgencyTag urgency="low" /><FlagTag flag="no_manager" /><FlagTag flag="overdue" /><LeaveTag label="On leave until 12 Nov" /></div><div className="flex items-center gap-4"><Avatar name="Amina Rahman" roleRing /><Avatar name="Rafi Islam" size="lg" /><AvatarStack people={[{ name: 'Amina Rahman' }, { name: 'Rafi Islam' }, { name: 'Nadia Khan' }, { name: 'Tanvir Ali' }]} /><WorkloadChip level="amber" detail="6 tasks · 3 projects" /><ScoreBadge score={81} band="good" trend={4} ratingCount={5} /></div></Section>

    <Section title="Cards and progress"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><StatTile label="Active projects" value={12} delta="2 more this month" href="#tables" icon={<Users aria-hidden className="size-5" />} /><StatTile label="Overdue tasks" value={3} tone="danger" /><Card><h3 className="font-semibold">Website redesign</h3><p className="mt-1 text-sm text-fg-muted">18 of 24 tasks done</p><ProgressBar className="mt-4" value={18} max={24} label="Project progress" /></Card></div></Section>

    <Section title="Navigation"><Tabs label="Project sections" items={[{ value: 'overview', label: 'Overview', content: <Card>Overview content</Card> }, { value: 'people', label: 'People', count: 8, content: <Card>People content</Card> }]} /><div className="flex flex-wrap items-center gap-4"><SegmentedControl label="Display" value={segment} onValueChange={setSegment} options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]} /><Pagination page={2} pageSize={10} total={42} pageSizeId={`${scope}-page-size`} onPage={() => undefined} onPageSize={() => undefined} /></div></Section>

    <Section title="Overlays and menus"><div className="flex flex-wrap gap-2"><Dialog trigger={<Button variant="secondary">Open dialog</Button>} title="Add person" description="Add someone to this organisation." footer={<Button>Save person</Button>}><Input label="Email" type="email" /></Dialog><ConfirmDialog trigger={<Button variant="danger">Archive project</Button>} title="Archive Website redesign?" description="Its 4 open tasks will be cancelled." confirmLabel="Archive project" onConfirm={() => undefined} /><ReasonDialog trigger={<Button variant="secondary">Reject request</Button>} title="Reject this request?" description="The requester will see your reason." submitLabel="Reject" onSubmit={() => undefined} /><Drawer trigger={<Button variant="secondary">Open drawer</Button>} title="Task details" description="Website redesign"><p className="text-sm text-fg-muted">Drawer content becomes full screen on mobile.</p></Drawer><DropdownMenu label="More actions" trigger={<Button variant="secondary" iconOnly aria-label="More actions"><Ellipsis aria-hidden className="size-4" /></Button>} items={[{ label: 'Edit' }, { label: 'Duplicate' }, { label: 'Archive', danger: true }]} /><Popover trigger={<Button variant="secondary">Open popover</Button>} title="Quick summary"><p className="text-sm text-fg-muted">Popover content stays keyboard accessible.</p></Popover><Tooltip content="Notifications waiting for you"><Button variant="ghost" iconOnly aria-label="Notifications"><Bell aria-hidden className="size-4" /></Button></Tooltip></div><CommandPalette items={[{ id: 'people', label: 'People', group: 'Pages', icon: <Users aria-hidden className="size-4" />, onSelect: () => undefined }, { id: 'tasks', label: 'Website task', group: 'Tasks', onSelect: () => undefined }]} /></Section>

    <Section title="Data table"><FilterBar search={search} onSearchChange={setSearch} searchLabel="Search people" chips={[{ id: 'role', label: 'Role: Manager', onRemove: () => undefined }]} onClear={() => setSearch('')}><Select label="Role"><option value="">All roles</option><option value="manager">Manager</option><option value="employee">Employee</option></Select></FilterBar><div id="tables"><DataTable caption="People" rows={people} columns={columns} rowKey={(person) => person.id} sort={{ id: 'name', direction: 'asc' }} onSort={() => undefined} selected={selected} onSelectionChange={setSelected} bulkActions={<Button size="sm" variant="danger">Suspend</Button>} pagination={{ page: 1, pageSize: 10, total: 2, pageSizeId: `${scope}-table-page-size`, onPage: () => undefined }} /></div><DataTable caption="Loading people" rows={[]} columns={columns} rowKey={(person) => person.id} loading /><DataTable caption="Empty people" rows={[]} columns={columns} rowKey={(person) => person.id} emptyTitle="No people yet" emptyDescription="Add your first person to begin." emptyAction={<Button>Add person</Button>} /><DataTable caption="Failed people" rows={[]} columns={columns} rowKey={(person) => person.id} error="The server could not be reached." onRetry={() => undefined} /></Section>

    <Section title="Standalone states"><div className="grid gap-3 sm:grid-cols-2"><EmptyState title="No requests waiting" description="New requests will appear here." action={<Button>Create request</Button>} /><ErrorState message="We could not load the project." onRetry={() => undefined} /><Card><Skeleton className="h-5 w-1/2" /><Skeleton className="mt-3 h-4 w-full" /><Skeleton className="mt-2 h-4 w-3/4" /></Card><Card><p className="font-semibold">Success state</p><p className="mt-1 text-sm text-success-fg">Your changes were saved.</p></Card></div></Section>
  </div></div></ToastProvider>;
}

export function DesignSystemGallery() {
  return <main className="min-h-screen bg-surface-sunken p-3 sm:p-6"><div className="mx-auto max-w-[1600px]"><header className="mb-6"><h1 className="text-3xl font-semibold text-fg">Office Ledger design system</h1><p className="mt-2 text-sm text-fg-muted">Development-only gallery · keyboard accessible · responsive at 375px and 1440px</p></header><ThemeGallery theme="light" /></div></main>;
}
