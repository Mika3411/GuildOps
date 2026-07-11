import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";

const NOTIFICATION_POLL_MS = 45000;
const SERVICE_WORKER_PATH = "/guildops-sw.js";

export function useNotificationsController({ apiEnabled, authSession, selectedGuild }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [pushState, setPushState] = useState(() => createInitialPushState());
  const guildId = selectedGuild?.id || "";

  const pushSupported = useMemo(() => isPushSupported(), []);

  const refreshPushState = useCallback(async () => {
    if (!pushSupported || !authSession.isAuthenticated || !apiEnabled) {
      setPushState((current) => ({
        ...current,
        supported: pushSupported,
        enabled: false,
        permission: getNotificationPermission(),
      }));
      return;
    }

    const [config, registration] = await Promise.all([
      guildOpsApi.getPushPublicKey().catch(() => ({ configured: false, publicKey: null })),
      navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH).catch(() => null),
    ]);
    const subscription = await registration?.pushManager?.getSubscription?.();

    setPushState((current) => ({
      ...current,
      supported: true,
      configured: Boolean(config?.configured && config?.publicKey),
      publicKey: config?.publicKey || "",
      enabled: Boolean(subscription),
      permission: getNotificationPermission(),
      message: config?.configured ? current.message : "Push serveur non configuré.",
    }));
  }, [apiEnabled, authSession.isAuthenticated, pushSupported]);

  const refreshNotifications = useCallback(
    async ({ signal } = {}) => {
      if (!apiEnabled || !authSession.isAuthenticated || !guildId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const payload = await guildOpsApi.listNotifications(guildId, { limit: 30 }, { signal });
      setNotifications((payload?.notifications || []).map(normalizeNotification).filter(Boolean));
      setUnreadCount(Number(payload?.unreadCount || 0));
      setNotificationError("");
    },
    [apiEnabled, authSession.isAuthenticated, guildId],
  );

  useEffect(() => {
    if (!apiEnabled || !authSession.isAuthenticated || !guildId) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    const controller = new AbortController();
    refreshNotifications({ signal: controller.signal }).catch((error) => {
      if (!controller.signal.aborted) {
        setNotificationError(error?.message || "Notifications indisponibles.");
      }
    });

    const interval = window.setInterval(() => {
      refreshNotifications().catch(() => {});
    }, NOTIFICATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [apiEnabled, authSession.isAuthenticated, guildId, refreshNotifications]);

  useEffect(() => {
    refreshPushState().catch(() => {});
  }, [refreshPushState]);

  async function markNotificationRead(notificationId) {
    if (!guildId || !notificationId) return;

    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, readAt: notification.readAt || new Date().toISOString() } : notification
    )));
    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      const payload = await guildOpsApi.markNotificationRead(guildId, notificationId);
      const updated = normalizeNotification(payload?.notification);
      if (updated?.id) {
        setNotifications((current) => current.map((notification) => (notification.id === updated.id ? updated : notification)));
      }
      await refreshNotifications();
    } catch (error) {
      setNotificationError(error?.message || "Notification non mise à jour.");
      await refreshNotifications().catch(() => {});
    }
  }

  async function markAllNotificationsRead() {
    if (!guildId) return;

    setNotifications((current) => current.map((notification) => ({
      ...notification,
      readAt: notification.readAt || new Date().toISOString(),
    })));
    setUnreadCount(0);

    try {
      await guildOpsApi.markAllNotificationsRead(guildId);
      await refreshNotifications();
    } catch (error) {
      setNotificationError(error?.message || "Notifications non mises à jour.");
      await refreshNotifications().catch(() => {});
    }
  }

  async function enablePushNotifications() {
    if (!pushSupported) {
      setPushState((current) => ({ ...current, message: "Push non supporté par ce navigateur." }));
      return false;
    }

    setPushState((current) => ({ ...current, enabling: true, message: "" }));

    try {
      const config = await guildOpsApi.getPushPublicKey();
      if (!config?.configured || !config?.publicKey) {
        setPushState((current) => ({
          ...current,
          configured: false,
          publicKey: "",
          enabling: false,
          message: "Push serveur non configuré.",
        }));
        return false;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState((current) => ({
          ...current,
          permission,
          enabling: false,
          message: "Autorisation navigateur refusée.",
        }));
        return false;
      }

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });

      await guildOpsApi.savePushSubscription(subscription.toJSON());
      setPushState({
        supported: true,
        configured: true,
        publicKey: config.publicKey,
        enabled: true,
        enabling: false,
        permission,
        message: "Push activé.",
      });
      return true;
    } catch (error) {
      setPushState((current) => ({
        ...current,
        enabling: false,
        message: error?.message || "Activation push impossible.",
      }));
      return false;
    }
  }

  async function disablePushNotifications() {
    setPushState((current) => ({ ...current, enabling: true, message: "" }));

    try {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
      const subscription = await registration?.pushManager?.getSubscription?.();
      if (subscription) {
        await guildOpsApi.removePushSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }

      setPushState((current) => ({
        ...current,
        enabled: false,
        enabling: false,
        permission: getNotificationPermission(),
        message: "Push désactivé.",
      }));
      return true;
    } catch (error) {
      setPushState((current) => ({
        ...current,
        enabling: false,
        message: error?.message || "Désactivation push impossible.",
      }));
      return false;
    }
  }

  return {
    notifications,
    notificationError,
    unreadNotificationCount: unreadCount,
    pushState,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    enablePushNotifications,
    disablePushNotifications,
  };
}

function normalizeNotification(notification = {}) {
  if (!notification || typeof notification !== "object") return null;

  return {
    id: notification.id || "",
    guildId: notification.guildId || notification.guild_id || "",
    type: notification.type || "notification",
    title: notification.title || "Notification",
    body: notification.body || "",
    data: notification.data && typeof notification.data === "object" ? notification.data : {},
    readAt: notification.readAt || notification.read_at || "",
    createdAt: notification.createdAt || notification.created_at || new Date().toISOString(),
  };
}

function createInitialPushState() {
  return {
    supported: isPushSupported(),
    configured: false,
    publicKey: "",
    enabled: false,
    enabling: false,
    permission: getNotificationPermission(),
    message: "",
  };
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function getNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
