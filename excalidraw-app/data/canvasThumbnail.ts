import { exportToCanvas } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** small JPEG data URL of the current scene, or null if empty / on failure */
export const generateThumbnail = async (
  api: ExcalidrawImperativeAPI,
): Promise<string | null> => {
  try {
    const elements = getNonDeletedElements(
      api.getSceneElementsIncludingDeleted(),
    );
    if (!elements.length) {
      return null;
    }
    const canvas = await exportToCanvas({
      elements,
      appState: { ...api.getAppState(), exportBackground: true },
      files: api.getFiles(),
      maxWidthOrHeight: 160,
    });
    return canvas.toDataURL("image/jpeg", 0.5);
  } catch (error) {
    console.warn("thumbnail generation failed", error);
    return null;
  }
};
