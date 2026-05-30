'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi, Analytics } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import AnalyticsDashboard from '@/app/components/admin/AnalyticsDashboard';
import { AnalyticsLoadingSkeleton } from '@/app/components/analytics/LoadingState';

export default function AdminDashboardPage() {
  const { data: analytics, isLoading } = useQuery<Analytics>({
    queryKey: queryKeys.admin.analytics.all(),
    queryFn: () => adminApi.getAnalytics(),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <AnalyticsLoadingSkeleton />;
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Failed to load analytics</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Platform Analytics
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Overview of platform health and user activity
        </p>
      </div>
      <AnalyticsDashboard analytics={analytics} />
    </div>
  );
}
