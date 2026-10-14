import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Avatar, AvatarStack, Badge, Banner, Button, Card, Checkbox, Combobox, DatePicker, DateRangePicker,
  EmptyState, ErrorState, Input, ProgressBar, Radio, ScoreBadge, Select, Skeleton,
  StatTile, StatusPill, Switch, Textarea, TimeInput, TimezoneSelect, UrgencyTag,
  type DateRangeValue,
} from '@/components/ui';
import { TASK_STATUSES } from '@/lib/hrms/status-vocabulary';

describe('design-system primitives', () => {
  it('renders button variants and exposes loading and disabled reasons', async () => {
    const user = userEvent.setup();
    render(<><Button>Save</Button><Button loading>Save</Button><Button disabled disabledReason="CEO approval is required">Disabled</Button></>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-busy', 'true');
    await user.hover(screen.getByText('Disabled').parentElement!);
    expect(await screen.findByText('CEO approval is required')).toBeVisible();
  });

  it('associates labels, helper text, errors and choices with controls', async () => {
    const user = userEvent.setup();
    render(<div><Input label="Name" helperText="Your public name" /><Input label="Email" error="Email is required" /><Textarea label="Notes" /><Select label="Role"><option>Employee</option></Select><Checkbox label="Notify me" /><Switch label="Approval required" /><Radio label="Place" options={[{ value: 'online', label: 'Online' }]} /><TimezoneSelect id="zone" label="Time zone" /></div>);
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Your public name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Email is required')).toHaveAttribute('role', 'alert');
    await user.click(screen.getByLabelText('Notify me'));
    expect(screen.getByLabelText('Notify me')).toBeChecked();
  });

  it('renders date, content, status and feedback components', () => {
    const range: DateRangeValue = { start: '2026-10-14', end: '2026-10-15', startHalf: false, endHalf: true };
    render(<><DatePicker label="Due date" /><DateRangePicker label="Leave dates" value={range} onChange={vi.fn()} /><TimeInput label="Start time" /><Badge>Neutral</Badge><StatusPill status={TASK_STATUSES.done} /><UrgencyTag urgency="high" /><Avatar name="Amina Rahman" /><Card>Card content</Card><StatTile label="Projects" value={12} /><ProgressBar value={4} max={10} label="Progress" /><ScoreBadge score={81} band="good" trend={2} ratingCount={5} /><Banner title="Heads up">Banner copy</Banner><EmptyState title="Empty" description="Nothing here" /><ErrorState message="Try later" /><Skeleton data-testid="skeleton" /></>);
    expect(screen.getByLabelText('Due date')).toHaveAttribute('type', 'date');
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByText('Done')).toBeVisible();
    expect(screen.getByText('81 / 100')).toBeVisible();
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes accessible names without prohibited ARIA attributes', () => {
    render(<><Avatar name="Amina Rahman" /><AvatarStack people={[{ name: 'Amina Rahman' }, { name: 'Rafi Islam' }]} /><ScoreBadge score={81} band="good" trend={2} ratingCount={5} /><Combobox label="Person" options={[{ value: 'Amina Rahman', label: 'Amina Rahman' }]} /></>);
    expect(screen.getAllByRole('img', { name: 'Amina Rahman' })).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Amina Rahman, Rafi Islam' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Up 2 points' })).toBeVisible();
    expect(screen.getByLabelText('Person')).not.toHaveAttribute('role');
  });
});
