import { MIME_TYPES } from "@excalidraw/common";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { switchCanvas } from "./canvasActions";
import { createCanvas, toStoredScene } from "./canvasStore";

export const isExcalidrawSceneFile = (file: File) =>
  /\.excalidraw$/i.test(file.name) || file.type === MIME_TYPES.excalidraw;

/** reads the file, stores it as a new canvas and opens it */
export const importFileAsCanvas = async (
  api: ExcalidrawImperativeAPI,
  file: File,
) => {
  // throws on invalid files, before anything is written
  const contents = await loadFromBlob(file, null, null);
  const name = file.name.replace(/\.(excalidraw|json)$/i, "").trim();

  const meta = await createCanvas({
    name: name || undefined,
    scene: toStoredScene(contents.elements, contents.appState),
    files: Object.values(contents.files ?? {}),
  });
  await switchCanvas(api, meta.id);
};

/** opens the native file picker and imports the chosen files as canvases */
export const pickAndImportFiles = (api: ExcalidrawImperativeAPI) =>
  new Promise<void>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.json";
    input.multiple = true;
    input.onchange = async () => {
      try {
        for (const file of Array.from(input.files ?? [])) {
          await importFileAsCanvas(api, file);
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
