"use client";

import {
    NotificationFilter,
} from "@/app/types/notifications";
import type { Notification } from "@/app/types/notifications";
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { notificationApi } from "@/app/lib/api/notification";
import { useApiError } from "@/app/lib/hooks/useApiError";
import { getWsUrl } from "@/app/lib/config";

const WS_URL = getWsUrl();

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: (filter?: NotificationFilter) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  playNotificationSound: () => void;
}

export function useNotifications(userId: string): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // True after the first successful connect; subsequent connects are reconnects
  const hasConnectedRef = useRef(false);
  const { handleError } = useApiError({ context: 'Notifications' });
  const debugNotifications =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEBUG_NOTIFICATIONS === 'true';

  // Initialize notification sound
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sounds/notification.mp3");
      audioRef.current.volume = 0.5;
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        if (debugNotifications) {
          console.warn('Notification sound playback failed', err);
        }
      });
    }
  }, [debugNotifications]);

  const fetchNotifications = useCallback(
    async (filter?: NotificationFilter) => {
      setLoading(true);
      try {
        const data = await notificationApi.getNotifications(filter);

        if (filter?.page && filter.page > 1) {
          setNotifications((prev) => [...prev, ...data.notifications]);
        } else {
          setNotifications(data.notifications);
        }

        setUnreadCount(data.unreadCount);
      } catch (error) {
        handleError(error, 'Unable to load notifications. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  // Stable ref so socket/visibility effects can call the latest fetchNotifications
  // without being listed as deps (which would tear down and recreate the socket).
  const fetchNotificationsRef = useRef(fetchNotifications);
  useEffect(() => {
    fetchNotificationsRef.current = fetchNotifications;
  });

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await notificationApi.markAsRead(notificationId);

      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId ? { ...notif, isRead: true } : notif
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      handleError(error, 'Unable to mark notification as read. Please try again.');
    }
  }, [handleError]);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationApi.markAllAsRead();

      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, isRead: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      handleError(error, 'Unable to mark all notifications as read. Please try again.');
    }
  }, [handleError]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await notificationApi.deleteNotification(notificationId);

      setNotifications((prev) =>
        prev.filter((notif) => notif.id !== notificationId)
      );
    } catch (error) {
      handleError(error, 'Unable to delete notification. Please try again.');
    }
  }, [handleError]);

  // WebSocket connection
  useEffect(() => {
    if (!userId) return;

    // get auth token from our client or cookies - we'll just omit it if the socket relies on cookies
    // Or we keep AUTH_TOKEN_KEY usage ONLY for websocket
    const token = localStorage.getItem("auth_token");

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (debugNotifications) {
        console.debug('Notifications websocket connected');
      }
      setIsConnected(true);
      socket.emit("join-notifications", userId);

      // On reconnect, pull fresh state from the API to catch any notifications
      // that arrived while the socket was down.
      if (hasConnectedRef.current) {
        fetchNotificationsRef.current();
      }
      hasConnectedRef.current = true;
    });

    socket.on("disconnect", () => {
      if (debugNotifications) {
        console.debug('Notifications websocket disconnected');
      }
      setIsConnected(false);
    });

    socket.on("notification", (notification: Notification) => {
      // Add to notifications list
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Play sound and show browser notification
      playNotificationSound();

      // Show browser notification if permitted
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(notification.title, {
          body: notification.message,
          icon: "/icons/notification-icon.png",
          badge: "/icons/badge-icon.png",
        });
      }
    });

    socket.on("connect_error", (error) => {
      if (debugNotifications) {
        console.debug('Notifications websocket connection error', error);
      }
      setIsConnected(false);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [userId, playNotificationSound, debugNotifications]);

  // Reconcile when the tab becomes visible again — covers the multi-tab read-all
  // case and any drift that built up while the tab was in the background.
  useEffect(() => {
    if (!userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotificationsRef.current();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [userId]);

  // Request browser notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isConnected,
    loading,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    deleteNotification,
    playNotificationSound,
  };
}
