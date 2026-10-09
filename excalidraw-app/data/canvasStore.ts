/**
 * Multi-canvas persistence (IndexedDB). Single database, key namespaces:
 *
 *   index                 -> CanvasIndex
 *   scene:<canvasId>      -> CanvasScene
 *   thumb:<canvasId>      -> string (data URL), kept apart so autosaves
 *                            don't rewrite the thumbnails
 *   file:<canvasId>:<id>  -> BinaryFileData
 *
 * `activeCanvasId` (module state) is the canvas open in *this tab*. The
 * `index.activeCanvasId` is only the "last opened" canvas, used on startup.
 */

import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "@excalidraw/excalidraw/appState";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  randomId,
} from "@excalidraw/common";
import { getNonDeletedElements } from "@excalidraw/element";
import { t } from "@excalidraw/excalidraw/i18n";
import {
  clear,
  createStore,
  delMany,
  entries,
  get,
  getMany,
  keys,
  set,
  setMany,
} from "idb-keyval";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";

export type CanvasMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type CanvasIndex = {
  canvases: CanvasMeta[];
  activeCanvasId: string | null;
};

export type CanvasScene = {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
};

const store = createStore("canvases-db", "canvases-store");

const INDEX_KEY = "index";
const sceneKey = (id: string) => `scene:${id}`;
const thumbKey = (id: string) => `thumb:${id}`;
const filePrefix = (id: string) => `file:${id}:`;
const fileKey = (id: string, fileId: string) => `${filePrefix(id)}${fileId}`;

/** the canvas open in this tab */
let activeCanvasId: string | null = null;

export const getActiveCanvasId = () => activeCanvasId;

// serializes every read-modify-write of the index
let queue: Promise<unknown> = Promise.resolve();
const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
};

const emptyIndex = (): CanvasIndex => ({ canvases: [], activeCanvasId: null });

const readIndex = async (): Promise<CanvasIndex> =>
  (await get<CanvasIndex>(INDEX_KEY, store)) ?? emptyIndex();

export const getIndex = () => readIndex();

export const getNextUntitledName = (names: readonly string[]) => {
  const base = t("canvases.untitled");
  if (!names.includes(base)) {
    return base;
  }
  let n = 2;
  while (names.includes(`${base} ${n}`)) {
    n++;
  }
  return `${base} ${n}`;
};

type CreateCanvasOptions = {
  name?: string;
  scene?: CanvasScene;
  files?: BinaryFileData[];
  thumbnail?: string | null;
  activate?: boolean;
};

/** NOTE: must run inside `serialize` */
const _createCanvas = async (
  index: CanvasIndex,
  opts: CreateCanvasOptions,
): Promise<CanvasMeta> => {
  const now = Date.now();
  const meta: CanvasMeta = {
    id: randomId(),
    name: opts.name ?? getNextUntitledName(index.canvases.map((c) => c.name)),
    createdAt: now,
    updatedAt: now,
  };
  // data first, index last: the index never points to a missing scene
  await set(
    sceneKey(meta.id),
    opts.scene ?? { elements: [], appState: {} },
    store,
  );
  if (opts.files?.length) {
    await setMany(
      opts.files.map((file) => [fileKey(meta.id, file.id), file]),
      store,
    );
  }
  if (opts.thumbnail) {
    await set(thumbKey(meta.id), opts.thumbnail, store);
  }
  index.canvases.push(meta);
  if (opts.activate || !index.activeCanvasId) {
    index.activeCanvasId = meta.id;
  }
  await set(INDEX_KEY, index, store);
  if (opts.activate) {
    activeCanvasId = meta.id;
  }
  return meta;
};

export const createCanvas = (opts: CreateCanvasOptions = {}) =>
  serialize(async () => _createCanvas(await readIndex(), opts));

/**
 * Loads (or creates) the index and sets this tab's active canvas to the
 * last opened one.
 */
export const initCanvasStore = () =>
  serialize(async () => {
    const index = await readIndex();
    if (!index.canvases.length) {
      await _createCanvas(index, { activate: true });
    } else if (!index.canvases.some((c) => c.id === index.activeCanvasId)) {
      index.activeCanvasId = index.canvases[0].id;
      await set(INDEX_KEY, index, store);
    }
    activeCanvasId = index.activeCanvasId;
    return index;
  });

export const renameCanvas = (id: string, name: string) =>
  serialize(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const index = await readIndex();
    const meta = index.canvases.find((c) => c.id === id);
    if (!meta || meta.name === trimmed) {
      return;
    }
    meta.name = trimmed;
    await set(INDEX_KEY, index, store);
  });

export const loadScene = async (id: string): Promise<CanvasScene | null> =>
  (await get<CanvasScene>(sceneKey(id), store)) ?? null;

export const saveScene = (
  id: string,
  scene: CanvasScene,
  opts: { thumbnail?: string | null } = {},
) =>
  serialize(async () => {
    const index = await readIndex();
    const meta = index.canvases.find((c) => c.id === id);
    if (!meta) {
      // deleted (e.g. from another tab): never bring it back
      return false;
    }
    await set(sceneKey(id), scene, store);
    if (opts.thumbnail) {
      await set(thumbKey(id), opts.thumbnail, store);
    }
    meta.updatedAt = Date.now();
    await set(INDEX_KEY, index, store);
    return true;
  });

export const getThumbnails = async (ids: readonly string[]) => {
  const values = await getMany<string>(ids.map(thumbKey), store);
  const result = new Map<string, string>();
  ids.forEach((id, i) => {
    if (values[i]) {
      result.set(id, values[i]);
    }
  });
  return result;
};

export const setActiveCanvas = (id: string) =>
  serialize(async () => {
    const index = await readIndex();
    if (!index.canvases.some((c) => c.id === id)) {
      throw new Error(t("canvases.errors.notFound"));
    }
    index.activeCanvasId = id;
    await set(INDEX_KEY, index, store);
    activeCanvasId = id;
  });

/** every storage key that belongs to a canvas */
const keysOfCanvas = async (id: string) => {
  const all = await keys<string>(store);
  return all.filter(
    (key) =>
      key === sceneKey(id) ||
      key === thumbKey(id) ||
      key.startsWith(filePrefix(id)),
  );
};

export const listCanvasFiles = async (id: string) => {
  const all = await entries<string, any>(store);
  return all
    .filter(([key]) => key.startsWith(filePrefix(id)))
    .map(([, value]) => value as BinaryFileData);
};

export const duplicateCanvas = (id: string) =>
  serialize(async () => {
    const index = await readIndex();
    const source = index.canvases.find((c) => c.id === id);
    const scene = await loadScene(id);
    if (!source || !scene) {
      throw new Error(t("canvases.errors.notFound"));
    }
    const files = await listCanvasFiles(id);
    const thumbnail = (await getThumbnails([id])).get(id) ?? null;
    return _createCanvas(index, {
      name: t("canvases.copyName", { name: source.name }),
      scene,
      files,
      thumbnail,
    });
  });

export const deleteCanvas = (id: string) =>
  serialize(async () => {
    const index = await readIndex();
    const deletedWasActive = activeCanvasId === id;
    index.canvases = index.canvases.filter((c) => c.id !== id);
    if (!index.canvases.length) {
      await _createCanvas(index, { activate: true });
    }
    if (!index.canvases.some((c) => c.id === index.activeCanvasId)) {
      const mostRecent = [...index.canvases].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )[0];
      index.activeCanvasId = mostRecent.id;
    }
    await set(INDEX_KEY, index, store);
    await delMany(await keysOfCanvas(id), store);
    if (deletedWasActive) {
      activeCanvasId = index.activeCanvasId;
    }
    return { activeCanvasId: index.activeCanvasId!, deletedWasActive };
  });

// -----------------------------------------------------------------------------
// files

export const getCanvasFiles = (id: string, fileIds: readonly FileId[]) =>
  getMany<BinaryFileData>(
    fileIds.map((fileId) => fileKey(id, fileId)),
    store,
  );

export const setCanvasFiles = async (
  id: string,
  files: readonly BinaryFileData[],
) => {
  if (files.length) {
    await setMany(
      files.map((file) => [fileKey(id, file.id), file]),
      store,
    );
  }
};

export const deleteCanvasFiles = async (
  id: string,
  fileIds: readonly FileId[],
) => {
  await delMany(
    fileIds.map((fileId) => fileKey(id, fileId)),
    store,
  );
};

// -----------------------------------------------------------------------------
// (de)serialization

export const toStoredScene = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
): CanvasScene => {
  const _appState = clearAppStateForLocalStorage(appState);

  if (
    _appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    _appState.openSidebar.tab === CANVAS_SEARCH_TAB
  ) {
    _appState.openSidebar = null;
  }

  return {
    elements: getNonDeletedElements(elements),
    // same JSON-safety guarantee we had with localStorage
    appState: JSON.parse(JSON.stringify(_appState)),
  };
};

export const fromStoredScene = (scene: CanvasScene) => ({
  elements: [...scene.elements] as ExcalidrawElement[],
  appState: {
    ...getDefaultAppState(),
    ...clearAppStateForLocalStorage(scene.appState),
  } as AppState,
});

/**
 * Scene of this tab's active canvas, or `null` when there is no active canvas
 * or it no longer exists (e.g. deleted from another tab). Callers must not
 * blank the editor on `null`.
 */
export const loadActiveCanvasState = async () => {
  const id = activeCanvasId;
  const scene = id ? await loadScene(id) : null;
  return scene ? fromStoredScene(scene) : null;
};

export const resetCanvasStoreForTests = async (
  opts: { keepData?: boolean } = {},
) => {
  if (!opts.keepData) {
    await clear(store);
  }
  activeCanvasId = null;
  queue = Promise.resolve();
};
