import { isInitializedImageElement } from "@excalidraw/element";
import { t } from "@excalidraw/excalidraw/i18n";
import { clear, createStore, getMany } from "idb-keyval";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import {
  createCanvas,
  deleteCanvas,
  getCanvasFiles,
  getIndex,
  initCanvasStore,
  loadScene,
  toStoredScene,
} from "./canvasStore";

// store used by the single-canvas version of the app
const legacyFilesStore = createStore("files-db", "files-store");

const readLegacyScene = () => {
  const rawElements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
  const rawAppState = localStorage.getItem(
    STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
  );
  if (rawElements === null && rawAppState === null) {
    return null;
  }
  try {
    return {
      elements: (rawElements
        ? JSON.parse(rawElements)
        : []) as ExcalidrawElement[],
      appState: (rawAppState ? JSON.parse(rawAppState) : {}) as AppState,
    };
  } catch (error) {
    // corrupt data: don't touch it, don't migrate it
    console.error("canvas migration: unreadable legacy data", error);
    return null;
  }
};

/**
 * One-off: moves the single legacy scene (localStorage + IndexedDB files)
 * into a first canvas named "Canvas 1". Old keys are removed only after the
 * new canvas was written and verified.
 */
export const migrateFromLocalStorage = async () => {
  if ((await getIndex()).canvases.length) {
    return false;
  }
  const legacy = readLegacyScene();
  if (!legacy) {
    return false;
  }

  const fileIds = legacy.elements
    .filter(isInitializedImageElement)
    .map((element) => element.fileId);
  const legacyFiles = (
    await getMany<BinaryFileData>(fileIds, legacyFilesStore)
  ).filter((file): file is BinaryFileData => !!file);

  const meta = await createCanvas({
    name: t("canvases.firstCanvas"),
    scene: toStoredScene(legacy.elements, legacy.appState),
    files: legacyFiles,
    activate: true,
  });

  // verify before deleting anything
  const scene = await loadScene(meta.id);
  const storedFiles = (
    await getCanvasFiles(
      meta.id,
      legacyFiles.map((f) => f.id as FileId),
    )
  ).filter(Boolean);
  const nonDeleted = legacy.elements.filter((element) => !element.isDeleted);
  if (
    !scene ||
    scene.elements.length !== nonDeleted.length ||
    storedFiles.length !== legacyFiles.length
  ) {
    await deleteCanvas(meta.id);
    throw new Error(t("canvases.errors.migrationFailed"));
  }

  localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
  localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
  await clear(legacyFilesStore);
  return true;
};

/**
 * Entry point used on app startup. Returns `null` when IndexedDB is not
 * usable (the app then runs with a single in-memory canvas).
 */
export const bootstrapCanvases = async () => {
  try {
    await migrateFromLocalStorage();
  } catch (error) {
    console.error(error);
  }
  try {
    return await initCanvasStore();
  } catch (error) {
    console.error(error);
    return null;
  }
};
