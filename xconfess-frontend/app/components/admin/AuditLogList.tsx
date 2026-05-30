"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, AuditLog } from "@/app/lib/api/admin";
import { useExportCSV } from "@/app/lib/hooks/useExportCSV";
import { queryKeys } from "@/app/lib/api/queryKeys";

export default function AuditLogList() {
  const { triggerExport } = useExportCSV({ label: 'audit logs' });
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [requestIdFilter, setRequestIdFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const filters = {
    actionFilter,
    entityTypeFilter,
    entityIdFilter: entityIdFilter.trim() || undefined,
    requestIdFilter: requestIdFilter.trim() || undefined,
    startDateFilter: startDateFilter || undefined,
    endDateFilter: endDateFilter || undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.auditLogs.list(filters),
    queryFn: () =>
      adminApi.getAuditLogs({
        action: actionFilter !== "all" ? actionFilter : undefined,
        entityType: entityTypeFilter !== "all" ? entityTypeFilter : undefined,
        entityId: entityIdFilter.trim() || undefined,
        requestId: requestIdFilter.trim() || undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters =
    actionFilter !== "all" ||
    entityTypeFilter !== "all" ||
    entityIdFilter.trim() ||
    requestIdFilter.trim() ||
    startDateFilter ||
    endDateFilter;

  const clearFilters = () => {
    setActionFilter("all");
    setEntityTypeFilter("all");
    setEntityIdFilter("");
    setRequestIdFilter("");
    setStartDateFilter("");
    setEndDateFilter("");
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading audit logs...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="report_resolved">Report Resolved</option>
              <option value="report_dismissed">Report Dismissed</option>
              <option value="confession_deleted">Confession Deleted</option>
              <option value="confession_hidden">Confession Hidden</option>
              <option value="user_banned">User Banned</option>
              <option value="user_unbanned">User Unbanned</option>
              <option value="bulk_action">Bulk Action</option>
              <option value="report_created">Report Created</option>
              <option value="failed_login">Failed Login</option>
              <option value="moderation_escalation">Moderation Escalation</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Entity Type
            </label>
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="report">Report</option>
              <option value="confession">Confession</option>
              <option value="user">User</option>
              <option value="comment">Comment</option>
              <option value="notification_dlq">Notification DLQ</option>
              <option value="data_export">Data Export</option>
              <option value="template_version">Template</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Entity ID
            </label>
            <input
              type="text"
              value={entityIdFilter}
              onChange={(e) => { setEntityIdFilter(e.target.value); setPage(1); }}
              placeholder="UUID of the target entity"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm px-3 py-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Request ID
            </label>
            <input
              type="text"
              value={requestIdFilter}
              onChange={(e) => { setRequestIdFilter(e.target.value); setPage(1); }}
              placeholder="Correlation request ID"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm px-3 py-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => { setStartDateFilter(e.target.value); setPage(1); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm px-3 py-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => { setEndDateFilter(e.target.value); setPage(1); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm px-3 py-2 border"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              const exportData = logs.map((log: AuditLog) => ({
                admin: log.admin?.username || `User ${log.adminId}`,
                action: log.action,
                entityType: log.entityType || "",
                entityId: log.entityId || "",
                notes: log.notes || "",
                createdAt: new Date(log.createdAt).toLocaleString(),
              }));
              triggerExport(
                exportData,
                `audit-logs-${new Date().toISOString().split("T")[0]}.csv`,
              );
            }}
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 text-sm"
          >
            Export CSV
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Admin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Entity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Request ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log: AuditLog) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {log.admin?.username || `User ${log.adminId}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {log.action.replace(/_/g, " ")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {log.entityType && log.entityId
                      ? `${log.entityType} #${log.entityId.substring(0, 8)}`
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {log.notes || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {log.requestId
                      ? log.requestId.substring(0, 8) + "..."
                      : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            {hasActiveFilters
              ? "No audit logs match your filters. Try adjusting the criteria."
              : "No audit logs recorded yet."}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} results
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded-md disabled:opacity-50 text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded-md disabled:opacity-50 text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
