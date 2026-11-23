import { useEffect, useRef } from "react";
import type { NotificationResponse } from "expo-notifications";
import { useMe } from "@/lib/session";
import { useStore } from "@/lib/store";
import { toInboxEvent } from "@/lib/notifications";
import {
  enablePush,
  notificationsModule,
  pushDataOf,
  registerDevice,
  shownAsPush,
  toApiNotification,
} from "@/lib/push";
import { useOpenNote } from "@/screens/shared";

/** Pushes already opened in this run of the app, so a remount does not open one twice. */
const handled = new Set<string>();

/**
 * Push for the signed-in (non-sample) user: registers the phone, pops a push up with sound even
 * while the app is open and refreshes the inbox then, and opens what a tapped push is about,
 * including the push that launched the app. Renders nothing; does nothing where push can't work.
 */
export default function PushNotifications() {
  const me = useMe();
  const { refreshNotices, refreshDeliveries } = useStore();
  const open = useOpenNote();
  // Read through refs so the listeners below are set up once per user, not on every render.
  const latest = useRef({ open, refreshNotices, refreshDeliveries });
  useEffect(() => {
    latest.current = { open, refreshNotices, refreshDeliveries };
  }, [open, refreshNotices, refreshDeliveries]);

  useEffect(() => {
    const N = notificationsModule();
    if (!N || me.demo) return;
    enablePush();
    // FCM can rotate the token; the API keeps the newest one for this session.
    const tokenSub = N.addPushTokenListener((t) => {
      if (typeof t.data === "string" && t.data) registerDevice(t.data).catch(() => {});
    });

    // Field users often have the app open while they work, so a push pops up with sound then too,
    // as it does when the app is closed. The in-app banner leaves these out (shownAsPush).
    N.setNotificationHandler({
      handleNotification: async (n) => {
        const d = pushDataOf(n.request.content.data);
        if (d) shownAsPush.add(d.notification_id);
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      },
    });
    const refresh = () => {
      latest.current.refreshNotices();
      latest.current.refreshDeliveries();
    };
    const received = N.addNotificationReceivedListener(refresh);

    const handle = (r: NotificationResponse | null) => {
      if (!r) return;
      const { identifier, content } = r.notification.request;
      if (handled.has(identifier)) return;
      handled.add(identifier);
      const d = pushDataOf(content.data);
      // A push for someone who used this phone before is not this user's to open.
      if (!d || (d.user_id && d.user_id !== me.id)) return;
      latest.current.open(toInboxEvent(toApiNotification(d, content.title, content.body), me.role));
      refresh();
    };
    const tapped = N.addNotificationResponseReceivedListener(handle);
    N.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => {});

    return () => {
      tokenSub.remove();
      received.remove();
      tapped.remove();
    };
  }, [me.id, me.role, me.demo]);

  return null;
}
