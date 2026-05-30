'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useComparison } from '@/app/lib/api/comparison';
import { useComparisonStore } from '@/app/lib/store/comparisonStore';
import { ComparisonTable } from './ComparisonTable';
import { Button } from '@/app/components/ui/button';
import { Share2 } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';

export function ComparisonTool() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const itemIds = idsParam ? idsParam.split(',').filter(Boolean) : [];
  const { data, isLoading, error } = useComparison(itemIds);
  const { clearItems } = useComparisonStore();
  const toast = useGlobalToast();

  useEffect(() => {
    // Clear selection when component mounts (after navigation)
    clearItems();
  }, [clearItems]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Comparison link copied to clipboard.');
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading comparison data...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">Error loading comparison data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Confession Comparison</h2>
        <Button variant="outline" onClick={handleShare}>
          <Share2 className="h-4 w-4 mr-2" />
          Share Comparison
        </Button>
      </div>

      <ComparisonTable data={data || { items: [], metrics: [] }} />

      {itemIds.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No confessions selected for comparison.</p>
          <p className="text-sm">Go back to the feed and select confessions to compare.</p>
        </div>
      )}
    </div>
  );
}
