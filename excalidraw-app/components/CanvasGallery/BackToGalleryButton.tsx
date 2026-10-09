import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { useAtomValue } from "../../app-jotai";
import { showGallery } from "../../data/canvasActions";
import { canvasIndexAtom, currentCanvasIdAtom } from "../../data/canvasAtoms";

import "./CanvasGallery.scss";

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
      disabled={!api}
      onClick={() => api && showGallery(api)}
    >
      {t("canvases.back")}
      {name && <span className="canvas-gallery-back__name">{name}</span>}
    </button>
  );
};
