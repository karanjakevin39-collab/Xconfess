'use client';

import { ComparisonData } from '@/app/lib/types/comparison';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

interface ComparisonTableProps {
  data: ComparisonData;
}

export function ComparisonTable({ data }: ComparisonTableProps) {
  if (!data.items.length) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">No items selected for comparison</p>
      </Card>
    );
  }

  const { items, metrics } = data;

  // Find the best value for each metric (highest number, or earliest date for createdAt)
  const getBestValue = (metric: string, values: (number | string)[]) => {
    if (metric === 'createdAt') {
      // For dates, "best" might be earliest (oldest)
      return Math.min(...values.map(v => new Date(v as string).getTime()));
    }
    // For numbers, highest is best
    return Math.max(...values.map(v => Number(v)));
  };

  const bestValues = metrics.reduce((acc, metric) => {
    const values = items.map(item => item.metrics[metric]);
    acc[metric] = getBestValue(metric, values);
    return acc;
  }, {} as Record<string, number>);

  const isBest = (metric: string, value: number | string) => {
    if (metric === 'createdAt') {
      return new Date(value as string).getTime() === bestValues[metric];
    }
    return Number(value) === bestValues[metric];
  };

  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="p-4 text-left font-semibold">Confession</th>
            {metrics.map(metric => (
              <th key={metric} className="p-4 text-left font-semibold capitalize">
                {metric.replace(/([A-Z])/g, ' $1').trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b hover:bg-muted/50">
              <td className="p-4">
                <div className="max-w-xs truncate" title={item.data.content}>
                  {item.name}
                </div>
              </td>
              {metrics.map(metric => {
                const value = item.metrics[metric];
                const best = isBest(metric, value);
                return (
                  <td key={metric} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={best ? 'font-bold text-primary' : ''}>
                        {value}
                      </span>
                      {best && <Badge variant="secondary">Best</Badge>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}