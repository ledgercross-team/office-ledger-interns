'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage } from '@/lib/format';
import type { Paginated, User } from '@/lib/types';

const PAGE_SIZE_OPTIONS = [5, 10] as const;

function PeopleList() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['people', 'list', { debounced, role, active, unassigned, page, pageSize }],
    queryFn: () =>
      apiFetch<Paginated<User>>(
        `/users${buildQuery({
          search: debounced,
          role,
          isActive: active,
          unassigned: unassigned || undefined,
          page,
          pageSize,
        })}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-charcoal">People</h1>
        <Link href="/people/new" className="rounded-xl bg-evergreen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-evergreen-dark">
          Add person
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
        <div className="space-y-1">
          <label htmlFor="search" className="block text-sm font-medium text-charcoal">
            Search
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
            className="rounded-xl border border-charcoal/15 px-3 py-2 outline-none placeholder:text-charcoal-soft focus:border-evergreen"
          />
        </div>
        {user?.role === 'admin' && (
          <div className="space-y-1">
            <label htmlFor="role" className="block text-sm font-medium text-charcoal">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen"
            >
              <option value="">All</option>
              <option value="admin">Admins</option>
              <option value="manager">Managers</option>
              <option value="employee">Employees</option>
            </select>
          </div>
        )}
        {user?.role === 'admin' && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={unassigned}
              onChange={(event) => {
                setUnassigned(event.target.checked);
                setPage(1);
              }}
            />
            Without a manager
          </label>
        )}
        <div className="space-y-1">
          <label htmlFor="active" className="block text-sm font-medium text-charcoal">
            Status
          </label>
          <select
            id="active"
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 outline-none focus:border-evergreen"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-charcoal-soft">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-alert-deep">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="text-sm text-charcoal-soft">No people found.</p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white shadow-[0_1px_2px_rgba(28,43,37,0.06)]">
          <table className="min-w-[48rem] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal/10 bg-offwhite text-charcoal-soft">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Reports to</th>
                <th className="px-4 py-2.5 font-medium">Job title</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/5">
              {query.data.items.map((person) => (
                <tr key={person.id} className="transition-colors hover:bg-mist/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/people/${person.id}`} className="font-medium text-evergreen hover:underline">
                      {person.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-charcoal-soft">{person.email}</td>
                  <td className="px-4 py-2.5 capitalize">{person.role}</td>
                  <td className="px-4 py-2.5 text-charcoal-soft">
                    {person.role === 'employee' ? (person.managerName ?? 'Not assigned') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-charcoal-soft">{person.jobTitle ?? '—'}</td>
                  <td className="px-4 py-2.5">{person.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (
        <PeoplePagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPage={setPage}
          onPageSize={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

function PeoplePagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-charcoal/10 pt-4">
      <div>
        <p className="text-sm font-medium text-charcoal">
          Showing {firstShown}–{lastShown} of {total}
        </p>
        <p className="text-xs text-charcoal-soft">Adjust the page size or move through the result set.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="people-page-size" className="font-medium text-charcoal">
          Page size
        </label>
        <select
          id="people-page-size"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 outline-none focus:border-evergreen"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} rows
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Previous people page"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ <span className="sr-only">Previous</span>
        </button>
        <span className="rounded-lg bg-evergreen px-3 py-1.5 font-medium text-white" aria-current="page">
          {page}
        </span>
        <button
          type="button"
          aria-label="Next people page"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          className="rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Next</span> ›
        </button>
      </div>
    </div>
  );
}

export default function PeoplePage() {
  return (
    <RoleGate allow={['admin', 'manager']}>
      <PeopleList />
    </RoleGate>
  );
}
