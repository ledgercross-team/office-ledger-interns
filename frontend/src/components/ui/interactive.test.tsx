import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button, ConfirmDialog, DataTable, Dialog, Drawer, DropdownMenu, Popover,
  ReasonDialog, Tabs, ToastProvider, Tooltip, useToast, type DataColumn,
} from '@/components/ui';

function ToastHarness() {
  const toast = useToast();
  return <Button onClick={() => toast({ title: 'Saved', tone: 'success' })}>Notify</Button>;
}

describe('interactive design-system components', () => {
  it('opens and closes dialogs with keyboard focus behavior', async () => {
    const user = userEvent.setup();
    render(<><Dialog trigger={<Button>Open dialog</Button>} title="Details"><p>Dialog body</p></Dialog><Drawer trigger={<Button>Open drawer</Button>} title="Drawer"><p>Drawer body</p></Drawer></>);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(screen.getByRole('dialog', { name: 'Drawer' })).toBeVisible();
  });

  it('requires a reason and confirms destructive actions', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    const confirm = vi.fn();
    render(<><ReasonDialog trigger={<Button>Reject</Button>} title="Reject request" onSubmit={submit} /><ConfirmDialog trigger={<Button>Archive</Button>} title="Archive project?" description="Open tasks will be cancelled." onConfirm={confirm} /></>);
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const reasonDialog = screen.getByRole('dialog', { name: 'Reject request' });
    expect(within(reasonDialog).getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.type(within(reasonDialog).getByRole('textbox', { name: /Reason/ }), 'Not ready');
    await user.click(within(reasonDialog).getByRole('button', { name: 'Continue' }));
    expect(submit).toHaveBeenCalledWith('Not ready');
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('supports tabs, menus, popovers, tooltips and toasts', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Tabs label="Sections" items={[{ value: 'one', label: 'One', content: 'First' }, { value: 'two', label: 'Two', content: 'Second' }]} /><DropdownMenu label="Actions" trigger={<Button>Actions</Button>} items={[{ label: 'Edit' }]} /><Popover trigger={<Button>Summary</Button>}>Popover body</Popover><Tooltip content="Helpful text"><Button>Help</Button></Tooltip><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByText('Second')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByText('Edit')).toBeVisible();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByText('Popover body')).toBeVisible();
    await user.hover(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByText('Helpful text')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(await screen.findByText('Saved')).toBeVisible();
  });

  it('sorts and selects rows in the responsive data table', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const onSelectionChange = vi.fn();
    const rows = [{ id: '1', name: 'Amina' }];
    const columns: DataColumn<(typeof rows)[number]>[] = [{ id: 'name', header: 'Name', sortable: true, cell: (row) => row.name }];
    render(<DataTable caption="People" rows={rows} columns={columns} rowKey={(row) => row.id} selected={new Set()} onSelectionChange={onSelectionChange} onSort={onSort} />);
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenCalledWith('name');
    await user.click(screen.getAllByLabelText('Select row 1')[0]);
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
