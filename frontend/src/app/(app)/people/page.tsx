'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Pagination } from '@/components/pagination';
import { RoleGate } from '@/components/role-gate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { buildQuery, errorMessage } from '@/lib/format';
import type { Paginated, User } from '@/lib/types';

const PAGE_SIZE = 20;

function PeopleList() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['people', 'list', { debounced, role, active, page }],
    queryFn: () =>
      apiFetch<Paginated<User>>(
        `/users${buildQuery({ search: debounced, role, isActive: active, page, pageSize: PAGE_SIZE })}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">People</h1>
        <Link href="/people/new" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
          Add person
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label htmlFor="search" className="block text-sm font-medium">
            Search
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
            className="rounded border px-3 py-2"
          />
        </div>
        {user?.role === 'admin' && (
          <div className="space-y-1">
            <label htmlFor="role" className="block text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              className="rounded border bg-background px-3 py-2"
            >
              <option value="">All</option>
              <option value="manager">Managers</option>
              <option value="employee">Employees</option>
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="active" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="active"
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setPage(1);
            }}
            className="rounded border bg-background px-3 py-2"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(query.error)}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="text-sm text-neutral-500">No people found.</p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Job title</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((person) => (
                <tr key={person.id} className="border-b">
                  <td className="py-2 pr-4">
                    <Link href={`/people/${person.id}`} className="font-medium hover:underline">
                      {person.fullName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{person.email}</td>
                  <td className="py-2 pr-4 capitalize">{person.role}</td>
                  <td className="py-2 pr-4">{person.jobTitle ?? '—'}</td>
                  <td className="py-2">{person.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPage={setPage}
        />
      )}
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
