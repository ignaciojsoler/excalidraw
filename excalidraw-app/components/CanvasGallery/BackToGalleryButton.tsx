import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { useAtomValue } from "../../app-jotai";
import { showGallery } from "../../data/canvasActions";
import { canvasIndexAtom, currentCanvasIdAtom } from "../../data/canvasAtoms";

import "./CanvasGallery.scss";

export const galleryIcon = (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="5.5" height="5.5" rx="1.25" />
    <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.25" />
    <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.25" />
    <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.25" />
  </svg>
);

/**
 * Quiet title next to the main menu: the open canvas' name. Clicking it goes
 * back to the gallery (like the file name in other design tools).
 */
export const BackToGalleryButton = () => {
  const api = useExcalidrawAPI();
  const { t } = useI18n();
  const index = useAtomValue(canvasIndexAtom);
  const currentId = useAtomValue(currentCanvasIdAtom);
  const name = index.canvases.find((c) => c.id === currentId)?.name;

  return (
    <button
      type="button"
      className="canvas-gallery-back"
      title={t("canvases.back")}
      aria-label={t("canvases.back")}
      disabled={!api}
      onClick={() => api && showGallery(api)}
    >
      <span className="canvas-gallery-back__icon">{galleryIcon}</span>
      {name && <span className="canvas-gallery-back__name">{name}</span>}
    </button>
  );
};
