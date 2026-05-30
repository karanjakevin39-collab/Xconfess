'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/app/lib/providers/AuthProvider';
import { useNotifications } from '@/app/lib/hooks/useNotifications';

export const WebSocketIndicator: React.FC = () => {
  const { user } = useAuth();
  
  // We only show indicator if there's a user since WS connects for logged-in users
  if (!user) return null;
  
  return <IndicatorContent userId={user.id} />;
};

const IndicatorContent = ({ userId }: { userId: string }) => {
  const { isConnected } = useNotifications(userId);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [hasInitiallyConnected, setHasInitiallyConnected] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setHasInitiallyConnected(true);
      setShowReconnecting(false);
    } else if (hasInitiallyConnected) {
      // Show reconnecting state if it was connected before and dropped
      setShowReconnecting(true);
    }
  }, [isConnected, hasInitiallyConnected]);

  if (!hasInitiallyConnected && !isConnected) {
    return null; // Do not show anything initially before first connect
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 text-xs font-medium opacity-80 hover:opacity-100 transition-opacity">
      {isConnected ? (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Live</span>
        </>
      ) : showReconnecting ? (
        <>
          <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse" />
          <span className="text-gray-600 dark:text-gray-300">Reconnecting...</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Disconnected</span>
        </>
      )}
    </div>
  );
};
