import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { isInitializedImageElement } from "@excalidraw/element";
import { t } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import { appJotaiStore } from "../app-jotai";

import { galleryOpenAtom, refreshCanvasState } from "./canvasAtoms";
import {
  createCanvas,
  deleteCanvas,
  duplicateCanvas,
  fromStoredScene,
  getActiveCanvasId,
  loadScene,
  renameCanvas,
  saveScene,
  setActiveCanvas,
  toStoredScene,
} from "./canvasStore";
import { generateThumbnail } from "./canvasThumbnail";
import { updateStaleImageStatuses } from "./FileManager";
import { LocalData } from "./LocalData";
import { updateBrowserStateVersion } from "./tabSync";

let editorReady = false;

/** App calls this once the initial scene is in the editor */
export const setCanvasEditorReady = (ready: boolean) => {
  editorReady = ready;
};

/**
 * Persists the editor's current content into the canvas open in this tab,
 * right now (not debounced).
 */
export const saveCurrentCanvasNow = async (
  api: ExcalidrawImperativeAPI,
  opts: { withThumbnail?: boolean } = {},
) => {
  const canvasId = getActiveCanvasId();
  if (!canvasId) {
    return;
  }
  LocalData.cancelPendingSave();
  const elements = api.getSceneElementsIncludingDeleted();
  const files = api.getFiles();
  const thumbnail = opts.withThumbnail ? await generateThumbnail(api) : null;

  await saveScene(canvasId, toStoredScene(elements, api.getAppState()), {
    thumbnail,
  });
  await LocalData.fileStorage.saveFiles({ elements, files });
  updateBrowserStateVersion(STORAGE_KEYS.VERSION_DATA_STATE);
};

/**
 * Replaces the editor content with `canvasId`'s and makes it this tab's
 * active canvas. Does NOT save the current content: callers decide.
 * Saves must be paused by the caller.
 */
const openCanvasInEditor = async (
  api: ExcalidrawImperativeAPI,
  canvasId: string,
) => {
  const stored = await loadScene(canvasId);
  if (!stored) {
    throw new Error(t("canvases.errors.openFailed"));
  }
  const { elements, appState } = fromStoredScene(stored);

  await setActiveCanvas(canvasId);
  // a fileId already saved for the previous canvas is NOT saved for this one
  LocalData.fileStorage.reset();

  const restored = restoreElements(elements, null, {
    repairBindings: true,
    deleteInvisibleElements: true,
  });
  api.updateScene({
    elements: restored,
    appState: {
      ...restoreAppState(appState, null),
      // the theme is an app-wide preference, not part of a canvas
      theme: api.getAppState().theme,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  api.history.clear();

  const fileIds = restored
    .filter(isInitializedImageElement)
    .map((element) => element.fileId);
  if (fileIds.length) {
    const { loadedFiles, erroredFiles } = await LocalData.fileStorage.getFiles(
      fileIds,
    );
    if (loadedFiles.length) {
      api.addFiles(loadedFiles);
    }
    updateStaleImageStatuses({
      excalidrawAPI: api,
      erroredFiles,
      elements: api.getSceneElementsIncludingDeleted(),
    });
  }
};

export const switchCanvas = async (
  api: ExcalidrawImperativeAPI,
  targetId: string,
) => {
  if (!editorReady) {
    return;
  }
  if (targetId !== getActiveCanvasId()) {
    LocalData.pauseSave("canvas-switch");
    try {
      await saveCurrentCanvasNow(api, { withThumbnail: true });
      await openCanvasInEditor(api, targetId);
      await refreshCanvasState();
    } finally {
      LocalData.resumeSave("canvas-switch");
    }
  }
  appJotaiStore.set(galleryOpenAtom, false);
};

/** saves the open canvas (with thumbnail) and shows the full-screen gallery */
export const showGallery = async (api: ExcalidrawImperativeAPI) => {
  if (!editorReady) {
    return;
  }
  await saveCurrentCanvasNow(api, { withThumbnail: true });
  await refreshCanvasState();
  appJotaiStore.set(galleryOpenAtom, true);
};

/** creates an empty canvas and opens it */
export const createNewCanvas = async (api: ExcalidrawImperativeAPI) => {
  if (!editorReady) {
    return;
  }
  const meta = await createCanvas();
  await switchCanvas(api, meta.id);
};

export const duplicateCanvasAction = async (
  api: ExcalidrawImperativeAPI,
  id: string,
) => {
  if (!editorReady) {
    return;
  }
  if (id === getActiveCanvasId()) {
    await saveCurrentCanvasNow(api);
  }
  await duplicateCanvas(id);
  await refreshCanvasState();
};

export const removeCanvas = async (
  api: ExcalidrawImperativeAPI,
  id: string,
) => {
  if (!editorReady) {
    return;
  }
  const isOpen = id === getActiveCanvasId();
  if (isOpen) {
    // the editor still shows the canvas being deleted: never autosave it
    LocalData.cancelPendingSave();
    LocalData.pauseSave("canvas-switch");
  }
  try {
    const { activeCanvasId } = await deleteCanvas(id);
    if (isOpen) {
      await openCanvasInEditor(api, activeCanvasId);
    }
    await refreshCanvasState();
  } finally {
    if (isOpen) {
      LocalData.resumeSave("canvas-switch");
    }
  }
};

export const renameCanvasAction = async (id: string, name: string) => {
  await renameCanvas(id, name);
  await refreshCanvasState();
};
