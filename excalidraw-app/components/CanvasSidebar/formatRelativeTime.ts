import { t } from "@excalidraw/excalidraw/i18n";

export const formatRelativeTime = (timestamp: number, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) {
    return t("canvases.time.now");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("canvases.time.minutes", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t("canvases.time.hours", { count: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return t("canvases.time.days", { count: days });
  }
  return new Date(timestamp).toLocaleDateString();
};
