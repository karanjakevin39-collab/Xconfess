'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, User } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import { useAdminConfirmation } from '@/app/components/admin/useAdminConfirmation';
import { Button } from '@/app/components/ui/button';

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const queryClient = useQueryClient();
  const { openConfirmation, confirmDialog } = useAdminConfirmation();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.users.search(searchQuery, page),
    queryFn: () => adminApi.searchUsers(searchQuery, limit, (page - 1) * limit),
    enabled: searchQuery.length > 0,
  });

  const banMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.banUser(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.all() });
      setSelectedUser(null);
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => adminApi.unbanUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.all() });
      setSelectedUser(null);
    },
  });

  const handleBan = (user: User) => {
    openConfirmation({
      title: `Ban ${user.username}?`,
      description: 'This will block the user from signing in and using the platform.',
      confirmLabel: 'Ban User',
      variant: 'danger',
      action: () => banMutation.mutateAsync({ id: user.id.toString() }),
      successMessage: 'User banned.',
      successOptions: {
        action: {
          label: 'Undo',
          onClick: () => unbanMutation.mutate(user.id.toString()),
        },
      },
      errorMessage: 'Failed to ban user.',
    });
  };

  const handleUnban = (user: User) => {
    openConfirmation({
      title: `Unban ${user.username}?`,
      description: 'This will restore the user account.',
      confirmLabel: 'Unban User',
      action: () => unbanMutation.mutateAsync(user.id.toString()),
      successMessage: 'User unbanned.',
      successOptions: {
        action: {
          label: 'Undo',
          onClick: () => banMutation.mutate({ id: user.id.toString() }),
        },
      },
      errorMessage: 'Failed to unban user.',
    });
  };

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {confirmDialog}

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by username..."
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* Users Table */}
      {searchQuery.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No users found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-gray-300 dark:after:bg-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map((user: User) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {user.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                                : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Banned'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {user.isAdmin ? 'Yes' : 'No'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-gray-200 dark:after:bg-gray-700">
                          <div className="flex gap-2">
                            {user.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleBan(user)}
                                aria-label={`Ban ${user.username}`}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 p-0"
                              >
                                Ban
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnban(user)}
                                aria-label={`Unban ${user.username}`}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 p-0"
                              >
                                Unban
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                              aria-label={`View history for ${user.username}`}
                              className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 p-0"
                            >
                              History
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}{' '}
                    results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                      className="px-4 py-2 border rounded-md disabled:opacity-50"
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      aria-label="Next page"
                      className="px-4 py-2 border rounded-md disabled:opacity-50"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* User History Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                User History: {selectedUser.username}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUser(null)}
                aria-label="Close user history"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0"
              >
                ✕
              </Button>
            </div>
            <UserHistory userId={selectedUser.id.toString()} />
          </div>
        </div>
      )}
    </div>
  );
}

function UserHistory({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.users.history(userId),
    queryFn: () => adminApi.getUserHistory(userId),
  });

  if (isLoading) {
    return <div className="text-center py-4 text-gray-500">Loading history...</div>;
  }

  if (!data) {
    return <div className="text-center py-4 text-gray-500">No history found</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Confessions</h4>
        {data.note && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{data.note}</div>
        )}
        {data.confessions?.length ? (
          <div className="space-y-2">
            {data.confessions.slice(0, 20).map((c: any) => (
              <div
                key={c.id}
                className="p-3 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                </div>
                <div className="text-sm text-gray-900 dark:text-white mt-1 line-clamp-2">
                  {c.message}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-mono">
                  {c.id}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">No confessions found</div>
        )}
      </div>
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Reports</h4>
        {data.reports?.length ? (
          <div className="space-y-2">
            {data.reports.slice(0, 20).map((r: any) => (
              <div
                key={r.id}
                className="p-3 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {r.type} · {r.status}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                  </div>
                </div>
                {r.reason && (
                  <div className="text-sm text-gray-700 dark:text-gray-200 mt-1">
                    {r.reason}
                  </div>
                )}
                {r.confession?.message && (
                  <div className="text-sm text-gray-700 dark:text-gray-200 mt-2 line-clamp-2">
                    Confession: {r.confession.message}
                  </div>
                )}
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-mono">
                  {r.id}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">No reports found</div>
        )}
      </div>
    </div>
  );
}
