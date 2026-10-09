import { exportToCanvas } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** small transparent PNG data URL of the current scene, or null if empty / on failure */
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
      // always light & transparent: the gallery applies the theme filter, so
      // the same thumbnail works in light and dark mode
      appState: {
        ...api.getAppState(),
        exportBackground: false,
        exportWithDarkMode: false,
      },
      files: api.getFiles(),
      maxWidthOrHeight: 360,
    });
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("thumbnail generation failed", error);
    return null;
  }
};
