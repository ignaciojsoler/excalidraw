/**
 * This file deals with saving data state (appState, elements, images, ...)
 * locally to the browser.
 *
 * Notes:
 *
 * - DataState refers to full state of the app: appState, elements, images,
 *   though some state is saved separately (collab username, library) for one
 *   reason or another. We also save different data to different storage
 *   (localStorage, indexedDB).
 */

import { debounce } from "@excalidraw/common";
import { createStore, get, set } from "idb-keyval";

import type { LibraryPersistedData } from "@excalidraw/excalidraw/data/library";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { MaybePromise } from "@excalidraw/common/utility-types";

import { appJotaiStore, atom } from "../app-jotai";
import { SAVE_TO_LOCAL_STORAGE_TIMEOUT, STORAGE_KEYS } from "../app_constants";

import { canvasSaveErrorAtom } from "./canvasAtoms";
import {
  deleteCanvasFiles,
  getActiveCanvasId,
  getCanvasFiles,
  listCanvasFiles,
  saveScene,
  setCanvasFiles,
  toStoredScene,
} from "./canvasStore";
import { FileManager } from "./FileManager";
import { FileStatusStore } from "./fileStatusStore";
import { Locker } from "./Locker";
import { updateBrowserStateVersion } from "./tabSync";

export const localStorageQuotaExceededAtom = atom(false);

class LocalFileManager extends FileManager {
  /** only looks at the active canvas; other canvases' files are never touched */
  clearObsoleteFiles = async (opts: { currentFileIds: FileId[] }) => {
    const canvasId = getActiveCanvasId();
    if (!canvasId) {
      return;
    }
    const files = await listCanvasFiles(canvasId);
    const obsolete = files
      .filter(
        (imageData) =>
          // if image is unused (not on canvas) & is older than 1 day, delete
          // it. We check `lastRetrieved` because we care about the last time
          // the image was used (loaded on canvas), not when it was created.
          (!imageData.lastRetrieved ||
            Date.now() - imageData.lastRetrieved > 24 * 3600 * 1000) &&
          !opts.currentFileIds.includes(imageData.id),
      )
      .map((imageData) => imageData.id);
    await deleteCanvasFiles(canvasId, obsolete);
  };
}

const saveDataStateToCanvas = async (
  canvasId: string | null,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  if (!canvasId) {
    // storage unavailable: nothing to persist to
    return;
  }
  const quotaExceeded = appJotaiStore.get(localStorageQuotaExceededAtom);
  const scene = toStoredScene(elements, appState);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await saveScene(canvasId, scene);
      updateBrowserStateVersion(STORAGE_KEYS.VERSION_DATA_STATE);
      appJotaiStore.set(canvasSaveErrorAtom, false);
      if (quotaExceeded) {
        appJotaiStore.set(localStorageQuotaExceededAtom, false);
      }
      return;
    } catch (error: any) {
      console.error(error);
      if (isQuotaExceededError(error) && !quotaExceeded) {
        appJotaiStore.set(localStorageQuotaExceededAtom, true);
      }
    }
  }
  appJotaiStore.set(canvasSaveErrorAtom, true);
};

const isQuotaExceededError = (error: any) => {
  return error instanceof DOMException && error.name === "QuotaExceededError";
};

type SavingLockTypes = "collaboration" | "canvas-switch";

export class LocalData {
  private static _save = debounce(
    async (
      canvasId: string | null,
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
      onFilesSaved: () => void,
    ) => {
      await saveDataStateToCanvas(canvasId, elements, appState);

      await this.fileStorage.saveFiles({
        elements,
        files,
      });
      onFilesSaved();
    },
    SAVE_TO_LOCAL_STORAGE_TIMEOUT,
  );

  static save = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
    onFilesSaved: () => void,
  ) => {
    // we need to make the `isSavePaused` check synchronously (undebounced)
    if (!this.isSavePaused()) {
      // capture the canvas now: it must not change while the save is debounced
      this._save(getActiveCanvasId(), elements, appState, files, onFilesSaved);
    }
  };

  /** drops a debounced save that has not run yet (used when switching canvas) */
  static cancelPendingSave = () => {
    this._save.cancel();
  };

  static flushSave = () => {
    this._save.flush();
  };

  private static locker = new Locker<SavingLockTypes>();

  static pauseSave = (lockType: SavingLockTypes) => {
    this.locker.lock(lockType);
  };

  static resumeSave = (lockType: SavingLockTypes) => {
    this.locker.unlock(lockType);
  };

  static isSavePaused = () => {
    return document.hidden || this.locker.isLocked();
  };

  // ---------------------------------------------------------------------------

  static fileStorage = new LocalFileManager({
    onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
    async getFiles(ids) {
      const canvasId = getActiveCanvasId();
      const loadedFiles: BinaryFileData[] = [];
      const erroredFiles = new Map<FileId, true>();
      if (!canvasId) {
        ids.forEach((id) => erroredFiles.set(id, true));
        return { loadedFiles, erroredFiles };
      }

      const filesData = await getCanvasFiles(canvasId, ids);
      const filesToSave: BinaryFileData[] = [];

      filesData.forEach((data, index) => {
        if (data) {
          const _data: BinaryFileData = { ...data, lastRetrieved: Date.now() };
          filesToSave.push(_data);
          loadedFiles.push(_data);
        } else {
          erroredFiles.set(ids[index], true);
        }
      });

      // save loaded files back to storage with updated `lastRetrieved`
      setCanvasFiles(canvasId, filesToSave).catch((error) =>
        console.warn(error),
      );

      return { loadedFiles, erroredFiles };
    },
    async saveFiles({ addedFiles }) {
      const savedFiles = new Map<FileId, BinaryFileData>();
      const erroredFiles = new Map<FileId, BinaryFileData>();
      const canvasId = getActiveCanvasId();

      // before we use `storage` event synchronization, let's update the flag
      // optimistically. Hopefully nothing fails, and an IDB read executed
      // before an IDB write finishes will read the latest value.
      updateBrowserStateVersion(STORAGE_KEYS.VERSION_FILES);

      await Promise.all(
        [...addedFiles].map(async ([id, fileData]) => {
          try {
            if (!canvasId) {
              throw new Error("no active canvas");
            }
            await setCanvasFiles(canvasId, [fileData]);
            savedFiles.set(id, fileData);
          } catch (error: any) {
            console.error(error);
            erroredFiles.set(id, fileData);
          }
        }),
      );

      return { savedFiles, erroredFiles };
    },
  });
}
export class LibraryIndexedDBAdapter {
  /** IndexedDB database and store name */
  private static idb_name = STORAGE_KEYS.IDB_LIBRARY;
  /** library data store key */
  private static key = "libraryData";

  private static store = createStore(
    `${LibraryIndexedDBAdapter.idb_name}-db`,
    `${LibraryIndexedDBAdapter.idb_name}-store`,
  );

  static async load() {
    const IDBData = await get<LibraryPersistedData>(
      LibraryIndexedDBAdapter.key,
      LibraryIndexedDBAdapter.store,
    );

    return IDBData || null;
  }

  static save(data: LibraryPersistedData): MaybePromise<void> {
    return set(
      LibraryIndexedDBAdapter.key,
      data,
      LibraryIndexedDBAdapter.store,
    );
  }
}

/** LS Adapter used only for migrating LS library data
 * to indexedDB */
export class LibraryLocalStorageMigrationAdapter {
  static load() {
    const LSData = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY,
    );
    if (LSData != null) {
      const libraryItems: ImportedDataState["libraryItems"] =
        JSON.parse(LSData);
      if (libraryItems) {
        return { libraryItems };
      }
    }
    return null;
  }
  static clear() {
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY);
  }
}
