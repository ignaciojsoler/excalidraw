# Multi-canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que `excalidraw-app` guarde varios canvas en IndexedDB y los liste en un sidebar, sin export/import manual.

**Architecture:** Un módulo `canvasStore` (IndexedDB vía `idb-keyval`, una sola base `canvases-db` con claves `index`, `scene:<id>`, `thumb:<id>`, `file:<id>:<fileId>`) reemplaza la escritura de escena en localStorage. `LocalData` guarda/carga sobre el canvas activo de la pestaña. `canvasActions` orquesta cambiar/crear/duplicar/borrar. Un tab "canvases" en el `DefaultSidebar` muestra la lista. `packages/excalidraw` no se toca.

**Tech Stack:** TypeScript, React, jotai (`../app-jotai`), `idb-keyval` 6.0.3, vitest + `fake-indexeddb/auto` (ya cargado en `setupTests.ts`), `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-10-08-multi-canvas-design.md`

## Global Constraints

- Solo IndexedDB, sin backend. No modificar nada bajo `packages/`.
- La library sigue en su store actual y se comparte entre canvas.
- Nombres por defecto: `"Sin título"`, `"Sin título 2"`, `"Sin título 3"`...; la migración crea `"Canvas 1"`.
- Textos de UI en español, tal como en el spec ("Nuevo canvas", "Exportar todos", "Importar backup", "Renombrar", "Duplicar", "Borrar").
- Todo lo que entra por archivo, drag & drop o link `#json`/`#url` crea un canvas nuevo y nunca pisa el actual. `#room` (colaboración) queda como hoy.
- Backup: un solo `.json`, `type: "excalidraw-multi-canvas-backup"`, `version: 1`; validar todo antes de escribir.
- Tras cada task: `yarn test:typecheck`, `yarn fix` y los tests del task deben pasar. Antes de terminar: `yarn test:update`.
- Estilo: seguir el código vecino (comillas dobles, `const` arrow functions, imports ordenados como en `LocalData.ts`). Correr los tests con `yarn vitest run excalidraw-app/tests/<archivo> --watch=false` desde la raíz del repo.
- Desviaciones menores respecto del spec (ya reflejadas en la tarea 9): una sola base IndexedDB con prefijos de clave en lugar de tres stores; la miniatura vive en su propia clave `thumb:<id>` para no reescribir el índice completo en cada autosave; el sidebar es un tab nuevo dentro del `DefaultSidebar` existente.

## Review Focus

Entradas/condiciones que el spec implica pero que nadie pidió probar explícitamente, de más a menos probable. Cada una tiene su test en la task indicada.

1. `clearObsoleteFiles` borra imágenes de **otros** canvas (hoy borra todo lo viejo y no usado del store global). Debe limitarse al canvas activo. → Task 4.
2. Una imagen con el mismo `fileId` pegada en dos canvas: `FileManager` cree que ya está guardada y no la escribe en el segundo. Hay que `reset()` el manager al cambiar de canvas. → Task 4 y 5.
3. Un autosave con debounce pendiente cae en el canvas equivocado después de cambiar. → Task 5.
4. Otra pestaña borra el canvas que esta pestaña tiene abierto: la sincronización no debe vaciar el editor ni resucitar el canvas. → Task 1 (`saveScene` devuelve `false`) y Task 4.
5. Dos acciones concurrentes sobre el índice (crear varios canvas a la vez) no deben perder entradas. → Task 1.

---

## File Structure

Crear (todo en `excalidraw-app/`):

- `data/canvasStore.ts`: persistencia IndexedDB, caché del canvas activo de la pestaña, (de)serialización de escenas.
- `data/canvasMigration.ts`: migración desde localStorage y `bootstrapCanvases()`.
- `data/canvasBackup.ts`: formato, validación, exportar/importar backup.
- `data/canvasAtoms.ts`: átomos jotai + `refreshCanvasState()`.
- `data/canvasThumbnail.ts`: `generateThumbnail(api)`.
- `data/canvasActions.ts`: `switchCanvas`, `createNewCanvas`, `duplicateActiveOrOther`, `removeCanvas`, `renameCanvasAction`, `openEmptyCanvas`, `setCanvasEditorReady`.
- `data/canvasImport.ts`: importar archivos `.excalidraw` como canvas nuevo.
- `components/CanvasSidebar/CanvasList.tsx`: componente presentacional.
- `components/CanvasSidebar/CanvasSidebar.tsx`: contenedor (hooks, acciones, backup, banners).
- `components/CanvasSidebar/CanvasSidebar.scss`: estilos.
- `components/CanvasSidebar/formatRelativeTime.ts`.
- Tests en `tests/`: `canvasStore.test.ts`, `canvasMigration.test.ts`, `canvasBackup.test.ts`, `LocalData.test.ts`, `canvasActions.test.ts`, `CanvasList.test.tsx`, `canvasImport.test.ts`.

Modificar:

- `data/LocalData.ts`: guardar/cargar sobre el canvas activo.
- `App.tsx`: bootstrap, `initializeScene`, `syncData`, import por link/drop, UIOptions, sidebar.
- `components/AppSidebar.tsx`: tab "canvases".
- `components/AppMainMenu.tsx`: reemplazar `LoadScene` por un item que importa como canvas nuevo.
- `docs/superpowers/specs/2026-10-08-multi-canvas-design.md`: reflejar las desviaciones.

---

### Task 1: `canvasStore` (IndexedDB)

**Files:**
- Create: `excalidraw-app/data/canvasStore.ts`
- Test: `excalidraw-app/tests/canvasStore.test.ts`

**Interfaces:**
- Produces (todo exportado desde `data/canvasStore.ts`):

```ts
export type CanvasMeta = { id: string; name: string; createdAt: number; updatedAt: number };
export type CanvasIndex = { canvases: CanvasMeta[]; activeCanvasId: string | null };
export type CanvasScene = { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> };
export const DEFAULT_CANVAS_NAME = "Sin título";
export const getNextUntitledName: (names: readonly string[]) => string;
export const getActiveCanvasId: () => string | null;
export const getIndex: () => Promise<CanvasIndex>;
export const initCanvasStore: () => Promise<CanvasIndex>;
export const createCanvas: (opts?: { name?: string; scene?: CanvasScene; files?: BinaryFileData[]; thumbnail?: string | null; activate?: boolean }) => Promise<CanvasMeta>;
export const renameCanvas: (id: string, name: string) => Promise<void>;
export const duplicateCanvas: (id: string) => Promise<CanvasMeta>;
export const deleteCanvas: (id: string) => Promise<{ activeCanvasId: string; deletedWasActive: boolean }>;
export const setActiveCanvas: (id: string) => Promise<void>;
export const loadScene: (id: string) => Promise<CanvasScene | null>;
export const saveScene: (id: string, scene: CanvasScene, opts?: { thumbnail?: string | null }) => Promise<boolean>;
export const getThumbnails: (ids: readonly string[]) => Promise<Map<string, string>>;
export const getCanvasFiles: (id: string, fileIds: readonly FileId[]) => Promise<(BinaryFileData | undefined)[]>;
export const setCanvasFiles: (id: string, files: readonly BinaryFileData[]) => Promise<void>;
export const listCanvasFiles: (id: string) => Promise<BinaryFileData[]>;
export const deleteCanvasFiles: (id: string, fileIds: readonly FileId[]) => Promise<void>;
export const toStoredScene: (elements: readonly ExcalidrawElement[], appState: AppState) => CanvasScene;
export const fromStoredScene: (scene: CanvasScene) => { elements: ExcalidrawElement[]; appState: AppState };
export const loadActiveCanvasState: () => Promise<{ elements: ExcalidrawElement[]; appState: AppState } | null>;
export const resetCanvasStoreForTests: () => Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

Create `excalidraw-app/tests/canvasStore.test.ts`:

```ts
import { newElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import {
  createCanvas,
  deleteCanvas,
  duplicateCanvas,
  getActiveCanvasId,
  getCanvasFiles,
  getIndex,
  getNextUntitledName,
  getThumbnails,
  initCanvasStore,
  listCanvasFiles,
  loadScene,
  renameCanvas,
  resetCanvasStoreForTests,
  saveScene,
  setActiveCanvas,
  setCanvasFiles,
} from "../data/canvasStore";

const makeFile = (id: string): BinaryFileData => ({
  id: id as FileId,
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAA" as DataURL,
  created: 1,
});

const makeScene = (n = 1) => ({
  elements: Array.from({ length: n }, () =>
    newElement({ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }),
  ),
  appState: {},
});

describe("canvasStore", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
  });

  it("names new canvases Sin título, Sin título 2, ...", async () => {
    expect(getNextUntitledName([])).toBe("Sin título");
    expect(getNextUntitledName(["Sin título"])).toBe("Sin título 2");
    expect(getNextUntitledName(["Sin título", "Sin título 2"])).toBe(
      "Sin título 3",
    );
    const a = await createCanvas();
    const b = await createCanvas();
    expect([a.name, b.name]).toEqual(["Sin título", "Sin título 2"]);
  });

  it("initCanvasStore creates one empty active canvas when there are none", async () => {
    const index = await initCanvasStore();
    expect(index.canvases).toHaveLength(1);
    expect(index.activeCanvasId).toBe(index.canvases[0].id);
    expect(getActiveCanvasId()).toBe(index.canvases[0].id);
  });

  it("initCanvasStore keeps the persisted active canvas", async () => {
    await createCanvas();
    const b = await createCanvas({ activate: true });
    // simulate a fresh page load
    await resetCanvasStoreForTests({ keepData: true });
    await initCanvasStore();
    expect(getActiveCanvasId()).toBe(b.id);
  });

  it("saves and loads a scene and bumps updatedAt", async () => {
    const meta = await createCanvas();
    const scene = makeScene(2);
    await new Promise((r) => setTimeout(r, 5));
    expect(await saveScene(meta.id, scene, { thumbnail: "data:thumb" })).toBe(
      true,
    );
    const loaded = await loadScene(meta.id);
    expect(loaded?.elements).toHaveLength(2);
    const index = await getIndex();
    expect(index.canvases[0].updatedAt).toBeGreaterThan(meta.updatedAt);
    expect((await getThumbnails([meta.id])).get(meta.id)).toBe("data:thumb");
  });

  it("saveScene does not resurrect a deleted canvas", async () => {
    const a = await createCanvas();
    await createCanvas();
    await deleteCanvas(a.id);
    expect(await saveScene(a.id, makeScene())).toBe(false);
    expect(await loadScene(a.id)).toBeNull();
    expect((await getIndex()).canvases.map((c) => c.id)).not.toContain(a.id);
  });

  it("renames (trimmed) and ignores empty names", async () => {
    const meta = await createCanvas();
    await renameCanvas(meta.id, "  Mi canvas  ");
    expect((await getIndex()).canvases[0].name).toBe("Mi canvas");
    await renameCanvas(meta.id, "   ");
    expect((await getIndex()).canvases[0].name).toBe("Mi canvas");
  });

  it("duplicates scene, files and thumbnail into an independent canvas", async () => {
    const a = await createCanvas({
      name: "Original",
      scene: makeScene(3),
      files: [makeFile("f1")],
      thumbnail: "data:thumb",
    });
    const b = await duplicateCanvas(a.id);
    expect(b.id).not.toBe(a.id);
    expect(b.name).toBe("Original (copia)");
    expect((await loadScene(b.id))?.elements).toHaveLength(3);
    expect(await listCanvasFiles(b.id)).toHaveLength(1);
    expect((await getThumbnails([b.id])).get(b.id)).toBe("data:thumb");
    await deleteCanvas(a.id);
    expect(await listCanvasFiles(b.id)).toHaveLength(1);
  });

  it("keeps files isolated per canvas, even with the same fileId", async () => {
    const a = await createCanvas();
    const b = await createCanvas();
    await setCanvasFiles(a.id, [makeFile("same")]);
    await setCanvasFiles(b.id, [makeFile("same")]);
    await deleteCanvas(a.id);
    expect(await getCanvasFiles(b.id, ["same" as FileId])).toHaveLength(1);
    expect((await getCanvasFiles(b.id, ["same" as FileId]))[0]?.id).toBe(
      "same",
    );
  });

  it("deleting the last canvas leaves a fresh empty one", async () => {
    const a = await createCanvas({ activate: true });
    const result = await deleteCanvas(a.id);
    expect(result.deletedWasActive).toBe(true);
    const index = await getIndex();
    expect(index.canvases).toHaveLength(1);
    expect(index.canvases[0].id).not.toBe(a.id);
    expect(index.activeCanvasId).toBe(result.activeCanvasId);
    expect(getActiveCanvasId()).toBe(result.activeCanvasId);
  });

  it("deleting the active canvas activates the most recently updated one", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const c = await createCanvas();
    await new Promise((r) => setTimeout(r, 5));
    await saveScene(b.id, makeScene());
    const result = await deleteCanvas(a.id);
    expect(result.activeCanvasId).toBe(b.id);
    expect(c.id).not.toBe(b.id);
  });

  it("setActiveCanvas updates the cache and the persisted index", async () => {
    const a = await createCanvas();
    const b = await createCanvas();
    await setActiveCanvas(b.id);
    expect(getActiveCanvasId()).toBe(b.id);
    expect((await getIndex()).activeCanvasId).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it("does not lose entries when many canvases are created concurrently", async () => {
    await Promise.all(Array.from({ length: 10 }, () => createCanvas()));
    const index = await getIndex();
    expect(index.canvases).toHaveLength(10);
    expect(new Set(index.canvases.map((c) => c.id)).size).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/canvasStore.test.ts --watch=false`
Expected: FAIL (module `../data/canvasStore` not found).

- [ ] **Step 3: Write the implementation**

Create `excalidraw-app/data/canvasStore.ts`:

```ts
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

export const DEFAULT_CANVAS_NAME = "Sin título";

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
  if (!names.includes(DEFAULT_CANVAS_NAME)) {
    return DEFAULT_CANVAS_NAME;
  }
  let n = 2;
  while (names.includes(`${DEFAULT_CANVAS_NAME} ${n}`)) {
    n++;
  }
  return `${DEFAULT_CANVAS_NAME} ${n}`;
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
  await set(sceneKey(meta.id), opts.scene ?? { elements: [], appState: {} }, store);
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
      throw new Error(`Canvas ${id} no existe`);
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
      throw new Error(`Canvas ${id} no existe`);
    }
    const files = await listCanvasFiles(id);
    const thumbnail = (await getThumbnails([id])).get(id) ?? null;
    return _createCanvas(index, {
      name: `${source.name} (copia)`,
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
  appState: AppState,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/canvasStore.test.ts --watch=false`
Expected: PASS (all). If a test depends on `randomId` ordering, note that in tests `randomId()` returns `id0, id1, ...` (unique).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn test:typecheck && yarn fix
git add excalidraw-app/data/canvasStore.ts excalidraw-app/tests/canvasStore.test.ts
git commit -m "feat(app): add IndexedDB canvas store" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migración desde localStorage y `bootstrapCanvases`

**Files:**
- Create: `excalidraw-app/data/canvasMigration.ts`
- Test: `excalidraw-app/tests/canvasMigration.test.ts`

**Interfaces:**
- Consumes: `createCanvas`, `loadScene`, `getCanvasFiles`, `getIndex`, `initCanvasStore`, `deleteCanvas`, `CanvasScene` (Task 1).
- Produces:
  - `migrateFromLocalStorage: () => Promise<boolean>`: `true` solo si migró.
  - `bootstrapCanvases: () => Promise<CanvasIndex | null>`: migra (errores solo se loguean), inicializa el store; devuelve `null` si IndexedDB no está disponible.

- [ ] **Step 1: Write the failing tests**

Create `excalidraw-app/tests/canvasMigration.test.ts`:

```ts
import { createStore, get, set } from "idb-keyval";
import { newElement, newImageElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";
import * as canvasStore from "../data/canvasStore";
import {
  bootstrapCanvases,
  migrateFromLocalStorage,
} from "../data/canvasMigration";

const legacyFilesStore = createStore("files-db", "files-store");

const file: BinaryFileData = {
  id: "img1" as FileId,
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAA" as DataURL,
  created: 1,
};

const seedLegacy = async () => {
  const rect = newElement({ type: "rectangle", x: 1, y: 2, width: 3, height: 4 });
  const image = newImageElement({
    type: "image",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    fileId: file.id,
    status: "saved",
  });
  localStorage.setItem(
    STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS,
    JSON.stringify([rect, image]),
  );
  localStorage.setItem(
    STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
    JSON.stringify({ viewBackgroundColor: "#ff0000" }),
  );
  await set(file.id, file, legacyFilesStore);
};

describe("canvasMigration", () => {
  beforeEach(async () => {
    localStorage.clear();
    await canvasStore.resetCanvasStoreForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves the legacy scene and its files into 'Canvas 1' and removes the old keys", async () => {
    await seedLegacy();
    expect(await migrateFromLocalStorage()).toBe(true);

    const index = await canvasStore.getIndex();
    expect(index.canvases).toHaveLength(1);
    expect(index.canvases[0].name).toBe("Canvas 1");
    expect(index.activeCanvasId).toBe(index.canvases[0].id);

    const scene = await canvasStore.loadScene(index.canvases[0].id);
    expect(scene?.elements).toHaveLength(2);
    expect(scene?.appState.viewBackgroundColor).toBe("#ff0000");
    expect(
      (await canvasStore.getCanvasFiles(index.canvases[0].id, [file.id]))[0]
        ?.dataURL,
    ).toBe(file.dataURL);

    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE)).toBeNull();
    expect(await get(file.id, legacyFilesStore)).toBeUndefined();
  });

  it("does nothing when there is no legacy data", async () => {
    expect(await migrateFromLocalStorage()).toBe(false);
    expect((await canvasStore.getIndex()).canvases).toHaveLength(0);
  });

  it("does nothing when canvases already exist (legacy keys untouched)", async () => {
    await canvasStore.createCanvas();
    await seedLegacy();
    expect(await migrateFromLocalStorage()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS)).not.toBeNull();
    expect((await canvasStore.getIndex()).canvases).toHaveLength(1);
  });

  it("leaves everything intact when the legacy JSON is corrupt", async () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS, "{not json");
    expect(await migrateFromLocalStorage()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS)).toBe(
      "{not json",
    );
    expect((await canvasStore.getIndex()).canvases).toHaveLength(0);
  });

  it("leaves legacy keys and files intact when writing fails", async () => {
    await seedLegacy();
    vi.spyOn(canvasStore, "createCanvas").mockRejectedValueOnce(
      new Error("boom"),
    );
    await expect(migrateFromLocalStorage()).rejects.toThrow("boom");
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS)).not.toBeNull();
    expect(await get(file.id, legacyFilesStore)).toBeDefined();
  });

  it("bootstrapCanvases migrates and activates the migrated canvas", async () => {
    await seedLegacy();
    const index = await bootstrapCanvases();
    expect(index?.canvases.map((c) => c.name)).toEqual(["Canvas 1"]);
    expect(canvasStore.getActiveCanvasId()).toBe(index?.activeCanvasId);
  });

  it("bootstrapCanvases creates an empty canvas on a fresh install", async () => {
    const index = await bootstrapCanvases();
    expect(index?.canvases).toHaveLength(1);
    expect(index?.canvases[0].name).toBe("Sin título");
  });
});
```

If `vi.spyOn(canvasStore, "createCanvas")` throws "Cannot redefine property", replace it with `vi.mock("../data/canvasStore", async (orig) => ({ ...(await orig<typeof import("../data/canvasStore")>()), createCanvas: vi.fn(orig...) }))` — any approach that makes the first `createCanvas` call reject is fine.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/canvasMigration.test.ts --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `excalidraw-app/data/canvasMigration.ts`:

```ts
import { isInitializedImageElement } from "@excalidraw/element";
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
  const rawAppState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
  if (rawElements === null && rawAppState === null) {
    return null;
  }
  try {
    return {
      elements: (rawElements ? JSON.parse(rawElements) : []) as ExcalidrawElement[],
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
  const legacyFiles = (await getMany<BinaryFileData>(fileIds, legacyFilesStore))
    .filter((file): file is BinaryFileData => !!file);

  const meta = await createCanvas({
    name: "Canvas 1",
    scene: toStoredScene(legacy.elements, legacy.appState),
    files: legacyFiles,
    activate: true,
  });

  // verify before deleting anything
  const scene = await loadScene(meta.id);
  const storedFiles = (
    await getCanvasFiles(meta.id, legacyFiles.map((f) => f.id as FileId))
  ).filter(Boolean);
  const nonDeleted = legacy.elements.filter((element) => !element.isDeleted);
  if (
    !scene ||
    scene.elements.length !== nonDeleted.length ||
    storedFiles.length !== legacyFiles.length
  ) {
    await deleteCanvas(meta.id);
    throw new Error("canvas migration: verification failed");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/canvasMigration.test.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn test:typecheck && yarn fix
git add excalidraw-app/data/canvasMigration.ts excalidraw-app/tests/canvasMigration.test.ts
git commit -m "feat(app): migrate legacy scene into the first canvas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Backup (formato, validación, exportar/importar)

**Files:**
- Create: `excalidraw-app/data/canvasBackup.ts`
- Test: `excalidraw-app/tests/canvasBackup.test.ts`

**Interfaces:**
- Consumes: `getIndex`, `loadScene`, `listCanvasFiles`, `createCanvas`, `CanvasScene`, `CanvasMeta` (Task 1).
- Produces:
  - `BACKUP_TYPE = "excalidraw-multi-canvas-backup"`, `BACKUP_VERSION = 1`
  - `type CanvasBackup = { type: typeof BACKUP_TYPE; version: number; exportedAt: number; canvases: { name: string; createdAt: number; updatedAt: number; scene: CanvasScene; files: BinaryFileData[] }[] }`
  - `buildBackup: () => Promise<CanvasBackup>`
  - `parseBackup: (text: string) => CanvasBackup` (lanza `Error` con mensaje en español)
  - `importBackup: (backup: CanvasBackup) => Promise<CanvasMeta[]>`
  - `downloadBackup: () => Promise<void>` (descarga `excalidraw-canvases-<fecha>.json`)

- [ ] **Step 1: Write the failing tests**

Create `excalidraw-app/tests/canvasBackup.test.ts`:

```ts
import { newElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import {
  BACKUP_TYPE,
  buildBackup,
  importBackup,
  parseBackup,
} from "../data/canvasBackup";
import {
  createCanvas,
  getIndex,
  listCanvasFiles,
  loadScene,
  resetCanvasStoreForTests,
} from "../data/canvasStore";

const file: BinaryFileData = {
  id: "f1" as FileId,
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAA" as DataURL,
  created: 1,
};

const scene = (n: number) => ({
  elements: Array.from({ length: n }, () =>
    newElement({ type: "rectangle", x: 0, y: 0, width: 5, height: 5 }),
  ),
  appState: { viewBackgroundColor: "#00ff00" },
});

describe("canvasBackup", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
  });

  it("round-trips every canvas with its files", async () => {
    await createCanvas({ name: "Uno", scene: scene(2), files: [file] });
    await createCanvas({ name: "Dos", scene: scene(3) });

    const text = JSON.stringify(await buildBackup());
    await resetCanvasStoreForTests();

    const imported = await importBackup(parseBackup(text));
    expect(imported.map((c) => c.name)).toEqual(["Uno", "Dos"]);
    expect((await loadScene(imported[0].id))?.elements).toHaveLength(2);
    expect((await loadScene(imported[1].id))?.elements).toHaveLength(3);
    expect((await loadScene(imported[0].id))?.appState.viewBackgroundColor).toBe(
      "#00ff00",
    );
    expect(await listCanvasFiles(imported[0].id)).toEqual([file]);
  });

  it("adds imported canvases without touching the existing ones", async () => {
    const existing = await createCanvas({ name: "Existente", scene: scene(1) });
    const text = JSON.stringify(await buildBackup());
    await importBackup(parseBackup(text));
    const index = await getIndex();
    expect(index.canvases).toHaveLength(2);
    expect(index.canvases[0].id).toBe(existing.id);
    expect(index.canvases.map((c) => c.name)).toEqual(["Existente", "Existente"]);
  });

  it.each([
    ["not json", "esto no es json"],
    ["wrong type", JSON.stringify({ type: "otra-cosa", version: 1, canvases: [] })],
    ["newer version", JSON.stringify({ type: BACKUP_TYPE, version: 99, canvases: [] })],
    ["canvases not an array", JSON.stringify({ type: BACKUP_TYPE, version: 1, canvases: {} })],
    [
      "canvas without elements",
      JSON.stringify({
        type: BACKUP_TYPE,
        version: 1,
        canvases: [{ name: "x", scene: { appState: {} }, files: [] }],
      }),
    ],
    [
      "file without dataURL",
      JSON.stringify({
        type: BACKUP_TYPE,
        version: 1,
        canvases: [
          {
            name: "x",
            createdAt: 1,
            updatedAt: 1,
            scene: { elements: [], appState: {} },
            files: [{ id: "f", mimeType: "image/png" }],
          },
        ],
      }),
    ],
  ])("rejects an invalid backup (%s) and writes nothing", async (_, text) => {
    expect(() => parseBackup(text)).toThrow();
    expect((await getIndex()).canvases).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/canvasBackup.test.ts --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `excalidraw-app/data/canvasBackup.ts`:

```ts
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import {
  createCanvas,
  getIndex,
  listCanvasFiles,
  loadScene,
} from "./canvasStore";

import type { CanvasMeta, CanvasScene } from "./canvasStore";

export const BACKUP_TYPE = "excalidraw-multi-canvas-backup";
export const BACKUP_VERSION = 1;

export type CanvasBackup = {
  type: typeof BACKUP_TYPE;
  version: number;
  exportedAt: number;
  canvases: {
    name: string;
    createdAt: number;
    updatedAt: number;
    scene: CanvasScene;
    files: BinaryFileData[];
  }[];
};

/**
 * NOTE: callers must persist the open canvas first (see
 * `saveCurrentCanvasNow`), otherwise the last edits are missing.
 */
export const buildBackup = async (): Promise<CanvasBackup> => {
  const index = await getIndex();
  const canvases: CanvasBackup["canvases"] = [];
  for (const meta of index.canvases) {
    const scene = (await loadScene(meta.id)) ?? { elements: [], appState: {} };
    canvases.push({
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      scene,
      files: await listCanvasFiles(meta.id),
    });
  }
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    canvases,
  };
};

const invalid = (reason: string) =>
  new Error(`El archivo de backup no es válido: ${reason}`);

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseBackup = (text: string): CanvasBackup => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid("no es JSON");
  }
  if (!isObject(data) || data.type !== BACKUP_TYPE) {
    throw invalid("no es un backup de canvas");
  }
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
    throw invalid("versión no soportada");
  }
  if (!Array.isArray(data.canvases)) {
    throw invalid("falta la lista de canvas");
  }
  for (const canvas of data.canvases) {
    if (
      !isObject(canvas) ||
      typeof canvas.name !== "string" ||
      !isObject(canvas.scene) ||
      !Array.isArray(canvas.scene.elements) ||
      !isObject(canvas.scene.appState) ||
      !Array.isArray(canvas.files)
    ) {
      throw invalid("un canvas está incompleto");
    }
    for (const file of canvas.files) {
      if (
        !isObject(file) ||
        typeof file.id !== "string" ||
        typeof file.mimeType !== "string" ||
        typeof file.dataURL !== "string"
      ) {
        throw invalid("una imagen está incompleta");
      }
    }
  }
  return data as CanvasBackup;
};

/** adds the backup's canvases to the list; never replaces existing ones */
export const importBackup = async (backup: CanvasBackup) => {
  const created: CanvasMeta[] = [];
  for (const canvas of backup.canvases) {
    created.push(
      await createCanvas({
        name: canvas.name,
        scene: canvas.scene,
        files: canvas.files,
      }),
    );
  }
  return created;
};

export const downloadBackup = async () => {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `excalidraw-canvases-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/canvasBackup.test.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
yarn test:typecheck && yarn fix
git add excalidraw-app/data/canvasBackup.ts excalidraw-app/tests/canvasBackup.test.ts
git commit -m "feat(app): add multi-canvas backup format" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `LocalData` y `App.tsx` sobre el canvas activo

**Files:**
- Create: `excalidraw-app/data/canvasAtoms.ts`
- Modify: `excalidraw-app/data/LocalData.ts`
- Modify: `excalidraw-app/App.tsx` (imports, `initializeScene` ~l.233, efecto de inicio ~l.565, `syncData` ~l.597-622)
- Test: `excalidraw-app/tests/LocalData.test.ts`

**Interfaces:**
- Consumes: `getActiveCanvasId`, `saveScene`, `toStoredScene`, `loadActiveCanvasState`, `getCanvasFiles`, `setCanvasFiles`, `listCanvasFiles`, `deleteCanvasFiles`, `getIndex` (Task 1); `bootstrapCanvases` (Task 2).
- Produces:
  - `data/canvasAtoms.ts`: `canvasIndexAtom: Atom<CanvasIndex>`, `currentCanvasIdAtom: Atom<string | null>`, `canvasStorageUnavailableAtom: Atom<boolean>`, `canvasSaveErrorAtom: Atom<boolean>`, `refreshCanvasState: () => Promise<void>`.
  - `LocalData.cancelPendingSave: () => void`, y `SavingLockTypes` pasa a `"collaboration" | "canvas-switch"`.

- [ ] **Step 1: Create the atoms file**

Create `excalidraw-app/data/canvasAtoms.ts`:

```ts
import { appJotaiStore, atom } from "../app-jotai";

import { getActiveCanvasId, getIndex } from "./canvasStore";

import type { CanvasIndex } from "./canvasStore";

export const canvasIndexAtom = atom<CanvasIndex>({
  canvases: [],
  activeCanvasId: null,
});

/** canvas open in this tab */
export const currentCanvasIdAtom = atom<string | null>(null);

/** IndexedDB is not usable: the app runs with a single in-memory canvas */
export const canvasStorageUnavailableAtom = atom(false);

/** the last autosave failed (after one retry) */
export const canvasSaveErrorAtom = atom(false);

export const refreshCanvasState = async () => {
  appJotaiStore.set(canvasIndexAtom, await getIndex());
  appJotaiStore.set(currentCanvasIdAtom, getActiveCanvasId());
};
```

- [ ] **Step 2: Write the failing tests**

Create `excalidraw-app/tests/LocalData.test.ts`:

```ts
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newElement, newImageElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  DataURL,
} from "@excalidraw/excalidraw/types";

import {
  createCanvas,
  getCanvasFiles,
  listCanvasFiles,
  loadScene,
  resetCanvasStoreForTests,
  setActiveCanvas,
  setCanvasFiles,
} from "../data/canvasStore";
import { LocalData } from "../data/LocalData";

const makeFile = (id: string, extra: Partial<BinaryFileData> = {}) =>
  ({
    id: id as FileId,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AAA" as DataURL,
    created: 1,
    ...extra,
  }) as BinaryFileData;

const imageElement = (fileId: string) =>
  newImageElement({
    type: "image",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    fileId: fileId as FileId,
    status: "pending",
  });

describe("LocalData over canvases", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
    LocalData.fileStorage.reset();
  });

  it("autosaves into the active canvas only", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const rect = newElement({ type: "rectangle", x: 0, y: 0, width: 5, height: 5 });

    LocalData.save([rect], getDefaultAppState() as AppState, {}, () => {});
    LocalData.flushSave();

    await vi.waitFor(async () => {
      expect((await loadScene(a.id))?.elements).toHaveLength(1);
    });
    expect((await loadScene(b.id))?.elements).toHaveLength(0);
  });

  it("stores image files under the active canvas", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const file = makeFile("img1");

    await LocalData.fileStorage.saveFiles({
      elements: [imageElement("img1")],
      files: { img1: file },
    });

    expect(await listCanvasFiles(a.id)).toHaveLength(1);
    expect(await listCanvasFiles(b.id)).toHaveLength(0);
  });

  it("writes the same fileId into the second canvas after reset()", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const file = makeFile("same");
    const args = { elements: [imageElement("same")], files: { same: file } };

    await LocalData.fileStorage.saveFiles(args);
    await setActiveCanvas(b.id);
    LocalData.fileStorage.reset();
    await LocalData.fileStorage.saveFiles(args);

    expect(await listCanvasFiles(a.id)).toHaveLength(1);
    expect(await listCanvasFiles(b.id)).toHaveLength(1);
  });

  it("clearObsoleteFiles only touches the active canvas", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    // no `lastRetrieved` => considered obsolete
    await setCanvasFiles(a.id, [makeFile("old")]);
    await setCanvasFiles(b.id, [makeFile("old")]);

    await LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: [] });

    expect(await listCanvasFiles(a.id)).toHaveLength(0);
    expect(await listCanvasFiles(b.id)).toHaveLength(1);
  });

  it("getFiles reads from the active canvas and refreshes lastRetrieved", async () => {
    const a = await createCanvas({ activate: true });
    await setCanvasFiles(a.id, [makeFile("img1")]);

    const { loadedFiles, erroredFiles } = await LocalData.fileStorage.getFiles([
      "img1" as FileId,
      "missing" as FileId,
    ]);

    expect(loadedFiles.map((f) => f.id)).toEqual(["img1"]);
    expect(erroredFiles.has("missing" as FileId)).toBe(true);
    await vi.waitFor(async () => {
      expect(
        (await getCanvasFiles(a.id, ["img1" as FileId]))[0]?.lastRetrieved,
      ).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/LocalData.test.ts --watch=false`
Expected: FAIL (autosave still writes to localStorage; files still in the old store).

- [ ] **Step 4: Rewrite the persistence part of `LocalData.ts`**

In `excalidraw-app/data/LocalData.ts`:

1. Replace the `idb-keyval` import with `import { createStore, get, set } from "idb-keyval";` (still used by `LibraryIndexedDBAdapter`). Remove the now-unused imports (`clearAppStateForLocalStorage`, `CANVAS_SEARCH_TAB`, `DEFAULT_SIDEBAR`, `getNonDeletedElements`, `updateBrowserStateVersion` stays).
2. Add:

```ts
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
```
3. Delete `const filesStore = createStore("files-db", "files-store");` (the migration owns that name now) and replace `LocalFileManager` and `saveDataStateToLocalStorage`:

```ts
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
```

4. `SavingLockTypes = "collaboration" | "canvas-switch";`
5. Replace `_save` and `save`:

```ts
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
```
Keep `flushSave`, `locker`, `pauseSave`, `resumeSave`, `isSavePaused` as they are.

6. Replace the `fileStorage` initializer's `getFiles` / `saveFiles`:

```ts
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
```

- [ ] **Step 5: Wire `App.tsx`**

1. Imports: remove `importFromLocalStorage` from the `./data/localStorage` import (keep the others); add
```ts
import { bootstrapCanvases } from "./data/canvasMigration";
import { loadActiveCanvasState } from "./data/canvasStore";
import { refreshCanvasState } from "./data/canvasAtoms";
```
2. In `initializeScene`, replace `const localDataState = importFromLocalStorage();` with
```ts
  const localDataState = await loadActiveCanvasState();
```
(the code already uses `localDataState?.elements` / `localDataState?.appState`).
3. In the startup effect (the one that calls `initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {...})`), change to:
```ts
    bootstrapCanvases()
      .then(async (index) => {
        if (!index) {
          appJotaiStore.set(canvasStorageUnavailableAtom, true);
        }
        await refreshCanvasState();
        return initializeScene({ collabAPI, excalidrawAPI });
      })
      .then(async (data) => {
        loadImages(data, /* isInitialLoad */ true);
        initialStatePromiseRef.current.promise.resolve(data.scene);
      });
```
   (import `canvasStorageUnavailableAtom` from `./data/canvasAtoms` and `appJotaiStore` from `../app-jotai` if not already imported.) If `getIndex` throws inside `refreshCanvasState` when storage is unavailable, wrap it in `try/catch` inside `refreshCanvasState`'s caller here and continue.
4. In `syncData`, replace
```ts
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
```
   with
```ts
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          loadActiveCanvasState().then((localDataState) => {
            // null: this tab's canvas was deleted elsewhere; keep the editor as is
            if (localDataState) {
              excalidrawAPI.updateScene({
                ...localDataState,
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }
          });
```
   and at the start of the same block (inside `if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {`) add `refreshCanvasState();` so the sidebar list follows other tabs.

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/LocalData.test.ts --watch=false`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, full app tests, commit**

```bash
yarn test:typecheck && yarn fix && yarn vitest run excalidraw-app --watch=false
git add excalidraw-app
git commit -m "feat(app): persist the scene into the active canvas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: typecheck clean, existing app tests (`collab`, `MobileMenu`, `LanguageList`) still pass.

---

### Task 5: Acciones de canvas (cambiar, crear, duplicar, borrar, renombrar)

**Files:**
- Create: `excalidraw-app/data/canvasThumbnail.ts`
- Create: `excalidraw-app/data/canvasActions.ts`
- Test: `excalidraw-app/tests/canvasActions.test.ts`

**Interfaces:**
- Consumes: Task 1 store API, `LocalData` (`cancelPendingSave`, `pauseSave`/`resumeSave("canvas-switch")`, `fileStorage.reset/saveFiles/getFiles`), `refreshCanvasState` (Task 4), `updateStaleImageStatuses` from `./FileManager`.
- Produces (`data/canvasActions.ts`), todas reciben `api: ExcalidrawImperativeAPI`:
  - `setCanvasEditorReady: (ready: boolean) => void` (las acciones no hacen nada hasta que sea `true`)
  - `saveCurrentCanvasNow: (api, opts?: { withThumbnail?: boolean }) => Promise<void>`
  - `switchCanvas: (api, targetId: string) => Promise<void>`
  - `createNewCanvas: (api) => Promise<void>` (crea y abre uno vacío; también sirve como `openEmptyCanvas`)
  - `duplicateCanvasAction: (api, id: string) => Promise<void>`
  - `removeCanvas: (api, id: string) => Promise<void>`
  - `renameCanvasAction: (id: string, name: string) => Promise<void>`
- Produces (`data/canvasThumbnail.ts`): `generateThumbnail: (api) => Promise<string | null>`.

- [ ] **Step 1: Thumbnail helper**

Create `excalidraw-app/data/canvasThumbnail.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

Create `excalidraw-app/tests/canvasActions.test.ts`:

```ts
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newElement } from "@excalidraw/element";

import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import {
  createNewCanvas,
  duplicateCanvasAction,
  removeCanvas,
  setCanvasEditorReady,
  switchCanvas,
} from "../data/canvasActions";
import {
  createCanvas,
  getActiveCanvasId,
  getIndex,
  loadScene,
  resetCanvasStoreForTests,
  saveScene,
} from "../data/canvasStore";
import { LocalData } from "../data/LocalData";

vi.mock("../data/canvasThumbnail", () => ({
  generateThumbnail: vi.fn().mockResolvedValue(null),
}));

const rect = () =>
  newElement({ type: "rectangle", x: 0, y: 0, width: 5, height: 5 });

const makeApi = (initial: any[] = []) => {
  let elements = initial;
  const api = {
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => getDefaultAppState() as unknown as AppState,
    getFiles: () => ({}),
    updateScene: vi.fn((update: any) => {
      if (update.elements) {
        elements = update.elements;
      }
    }),
    addFiles: vi.fn(),
    setToast: vi.fn(),
    history: { clear: vi.fn() },
  } as unknown as ExcalidrawImperativeAPI;
  return { api, getElements: () => elements };
};

describe("canvasActions", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
    LocalData.fileStorage.reset();
    setCanvasEditorReady(true);
  });

  afterEach(() => {
    setCanvasEditorReady(false);
  });

  it("switchCanvas saves the current canvas, loads the target and resets history", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas({
      scene: { elements: [rect(), rect()], appState: {} },
    });
    const { api, getElements } = makeApi([rect()]);

    await switchCanvas(api, b.id);

    expect((await loadScene(a.id))?.elements).toHaveLength(1);
    expect(getElements()).toHaveLength(2);
    expect(getActiveCanvasId()).toBe(b.id);
    expect((await getIndex()).activeCanvasId).toBe(b.id);
    expect(api.history.clear).toHaveBeenCalled();
  });

  it("a debounced save pending before the switch never lands in the new canvas", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const { api } = makeApi([rect()]);

    LocalData.save([rect(), rect(), rect()], getDefaultAppState() as AppState, {}, () => {});
    await switchCanvas(api, b.id);
    await new Promise((r) => setTimeout(r, 450)); // > SAVE_TO_LOCAL_STORAGE_TIMEOUT

    expect((await loadScene(b.id))?.elements).toHaveLength(0);
    expect((await loadScene(a.id))?.elements).toHaveLength(1);
  });

  it("does nothing until the editor is ready or when the target is already active", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const { api } = makeApi();

    setCanvasEditorReady(false);
    await switchCanvas(api, b.id);
    expect(getActiveCanvasId()).toBe(a.id);

    setCanvasEditorReady(true);
    await switchCanvas(api, a.id);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("a failed switch keeps the current canvas open and rethrows", async () => {
    const a = await createCanvas({ activate: true });
    const { api } = makeApi([rect()]);

    await expect(switchCanvas(api, "does-not-exist")).rejects.toThrow();

    expect(getActiveCanvasId()).toBe(a.id);
    expect(api.updateScene).not.toHaveBeenCalled();
    // saves are resumed after the failure
    expect(LocalData.isSavePaused()).toBe(false);
  });

  it("createNewCanvas opens a new empty canvas named Sin título 2", async () => {
    const a = await createCanvas({ activate: true });
    const { api, getElements } = makeApi([rect()]);

    await createNewCanvas(api);

    const index = await getIndex();
    expect(index.canvases.map((c) => c.name)).toEqual(["Sin título", "Sin título 2"]);
    expect(getActiveCanvasId()).not.toBe(a.id);
    expect(getElements()).toHaveLength(0);
    expect((await loadScene(a.id))?.elements).toHaveLength(1);
  });

  it("duplicating the open canvas includes its unsaved edits", async () => {
    const a = await createCanvas({ activate: true });
    const { api } = makeApi([rect(), rect()]);

    await duplicateCanvasAction(api, a.id);

    const index = await getIndex();
    expect(index.canvases).toHaveLength(2);
    const copy = index.canvases.find((c) => c.id !== a.id)!;
    expect(copy.name).toBe("Sin título (copia)");
    expect((await loadScene(copy.id))?.elements).toHaveLength(2);
    expect(getActiveCanvasId()).toBe(a.id);
  });

  it("removing the open canvas opens another one without saving over it", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas({
      scene: { elements: [rect()], appState: {} },
    });
    await saveScene(b.id, { elements: [rect()], appState: {} });
    const { api, getElements } = makeApi([rect(), rect(), rect()]);

    await removeCanvas(api, a.id);

    expect(getActiveCanvasId()).toBe(b.id);
    expect(getElements()).toHaveLength(1);
    expect((await loadScene(b.id))?.elements).toHaveLength(1);
    expect((await getIndex()).canvases.map((c) => c.id)).toEqual([b.id]);
  });

  it("removing the last canvas leaves a fresh empty one open", async () => {
    const a = await createCanvas({ activate: true });
    const { api, getElements } = makeApi([rect()]);

    await removeCanvas(api, a.id);

    const index = await getIndex();
    expect(index.canvases).toHaveLength(1);
    expect(index.canvases[0].id).not.toBe(a.id);
    expect(getElements()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/canvasActions.test.ts --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 4: Write the implementation**

Create `excalidraw-app/data/canvasActions.ts`:

```ts
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { isInitializedImageElement } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import { refreshCanvasState } from "./canvasAtoms";
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
    throw new Error("No se pudo abrir el canvas: ya no existe");
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
    appState: restoreAppState(appState, null),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  api.history.clear();

  const fileIds = restored
    .filter(isInitializedImageElement)
    .map((element) => element.fileId);
  if (fileIds.length) {
    const { loadedFiles, erroredFiles } =
      await LocalData.fileStorage.getFiles(fileIds);
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
  if (!editorReady || targetId === getActiveCanvasId()) {
    return;
  }
  LocalData.pauseSave("canvas-switch");
  try {
    await saveCurrentCanvasNow(api, { withThumbnail: true });
    await openCanvasInEditor(api, targetId);
    await refreshCanvasState();
  } finally {
    LocalData.resumeSave("canvas-switch");
  }
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
```

Note: `createCanvas({ activate: false })` keeps the persisted `index.activeCanvasId` unchanged, so a crash between `createCanvas` and `switchCanvas` leaves the user on the previous canvas.

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/canvasActions.test.ts --watch=false`
Expected: PASS. If `exportToCanvas` import breaks module loading in the test, the `vi.mock("../data/canvasThumbnail")` above already prevents it; if another import (e.g. `@excalidraw/excalidraw` entry) is slow, keep it, the other app tests import it too.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
yarn test:typecheck && yarn fix
git add excalidraw-app/data/canvasThumbnail.ts excalidraw-app/data/canvasActions.ts excalidraw-app/tests/canvasActions.test.ts
git commit -m "feat(app): add canvas switch/create/duplicate/delete actions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sidebar de canvas

**Files:**
- Create: `excalidraw-app/components/CanvasSidebar/formatRelativeTime.ts`
- Create: `excalidraw-app/components/CanvasSidebar/CanvasList.tsx`
- Create: `excalidraw-app/components/CanvasSidebar/CanvasSidebar.tsx`
- Create: `excalidraw-app/components/CanvasSidebar/CanvasSidebar.scss`
- Modify: `excalidraw-app/components/AppSidebar.tsx`
- Modify: `excalidraw-app/App.tsx` (llamar `setCanvasEditorReady(true)` tras resolver la escena inicial)
- Test: `excalidraw-app/tests/CanvasList.test.tsx`

**Interfaces:**
- Consumes: Task 5 actions, Task 4 atoms, `getThumbnails`, `openConfirmModal` (`@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState`, ver `shareableLinkConfirmDialog` en `App.tsx` para la forma `{ title, description, actionLabel, color: "danger" }`).
- Produces:
  - `formatRelativeTime: (timestamp: number, now?: number) => string`
  - `CanvasList` props:
```ts
type CanvasListProps = {
  canvases: readonly CanvasMeta[];
  currentId: string | null;
  thumbnails: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  footer?: React.ReactNode;
};
```

- [ ] **Step 1: Write the failing tests**

Create `excalidraw-app/tests/CanvasList.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { CanvasList } from "../components/CanvasSidebar/CanvasList";
import { formatRelativeTime } from "../components/CanvasSidebar/formatRelativeTime";

const NOW = 1_700_000_000_000;

const canvases = [
  { id: "a", name: "Viejo", createdAt: 1, updatedAt: NOW - 3 * 3600 * 1000 },
  { id: "b", name: "Reciente", createdAt: 2, updatedAt: NOW - 30 * 1000 },
  { id: "c", name: "Medio", createdAt: 3, updatedAt: NOW - 5 * 60 * 1000 },
];

const setup = (overrides: Partial<React.ComponentProps<typeof CanvasList>> = {}) => {
  const handlers = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
  };
  render(
    <CanvasList
      canvases={canvases}
      currentId="c"
      thumbnails={new Map()}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
};

describe("formatRelativeTime", () => {
  it("formats in Spanish", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("hace un momento");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("hace 5 min");
    expect(formatRelativeTime(NOW - 3 * 3600_000, NOW)).toBe("hace 3 h");
    expect(formatRelativeTime(NOW - 2 * 86400_000, NOW)).toBe("hace 2 d");
  });
});

describe("CanvasList", () => {
  it("lists canvases most recently updated first", () => {
    setup();
    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names[0]).toContain("Reciente");
    expect(names[1]).toContain("Medio");
    expect(names[2]).toContain("Viejo");
  });

  it("marks the current canvas", () => {
    setup();
    const current = screen.getByText("Medio").closest("li")!;
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Viejo").closest("li")!.getAttribute("aria-current")).toBeNull();
  });

  it("filters by name", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Buscar canvas"), {
      target: { value: "vie" },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Viejo")).toBeTruthy();
  });

  it("selects a canvas on click and creates a new one with the button", () => {
    const h = setup();
    fireEvent.click(screen.getByText("Viejo"));
    expect(h.onSelect).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByText("+ Nuevo canvas"));
    expect(h.onCreate).toHaveBeenCalled();
  });

  it("renames from the menu, trimming the name", () => {
    const h = setup();
    fireEvent.click(screen.getByLabelText("Acciones de Viejo"));
    fireEvent.click(screen.getByText("Renombrar"));
    const input = screen.getByDisplayValue("Viejo");
    fireEvent.change(input, { target: { value: "  Nuevo nombre  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("a", "Nuevo nombre");
  });

  it("renames on double click and cancels with Escape", () => {
    const h = setup();
    fireEvent.doubleClick(screen.getByText("Viejo"));
    const input = screen.getByDisplayValue("Viejo");
    fireEvent.change(input, { target: { value: "otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Viejo")).toBeTruthy();
  });

  it("duplicates, exports and deletes from the menu", () => {
    const h = setup();
    fireEvent.click(screen.getByLabelText("Acciones de Viejo"));
    fireEvent.click(screen.getByText("Duplicar"));
    expect(h.onDuplicate).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByLabelText("Acciones de Viejo"));
    fireEvent.click(screen.getByText("Exportar este canvas"));
    expect(h.onExport).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByLabelText("Acciones de Viejo"));
    fireEvent.click(screen.getByText("Borrar"));
    expect(h.onDelete).toHaveBeenCalledWith("a");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/CanvasList.test.tsx --watch=false`
Expected: FAIL (modules not found).

- [ ] **Step 3: `formatRelativeTime.ts`**

```ts
export const formatRelativeTime = (timestamp: number, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) {
    return "hace un momento";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `hace ${days} d`;
  }
  return new Date(timestamp).toLocaleDateString();
};
```

- [ ] **Step 4: `CanvasList.tsx`**

```tsx
import React, { useState } from "react";

import { formatRelativeTime } from "./formatRelativeTime";

import type { CanvasMeta } from "../../data/canvasStore";

import "./CanvasSidebar.scss";

type CanvasListProps = {
  canvases: readonly CanvasMeta[];
  currentId: string | null;
  thumbnails: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  footer?: React.ReactNode;
};

export const CanvasList = (props: CanvasListProps) => {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const visible = [...props.canvases]
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const startRename = (canvas: CanvasMeta) => {
    setMenuId(null);
    setDraft(canvas.name);
    setRenamingId(canvas.id);
  };

  const commitRename = (id: string) => {
    const name = draft.trim();
    setRenamingId(null);
    if (name) {
      props.onRename(id, name);
    }
  };

  return (
    <div className="canvas-sidebar">
      <button
        type="button"
        className="canvas-sidebar__new"
        onClick={props.onCreate}
      >
        + Nuevo canvas
      </button>
      <input
        className="canvas-sidebar__search"
        type="search"
        placeholder="Buscar canvas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="canvas-sidebar__list">
        {visible.map((canvas) => {
          const thumbnail = props.thumbnails.get(canvas.id);
          return (
            <li
              key={canvas.id}
              className="canvas-sidebar__item"
              aria-current={canvas.id === props.currentId ? "true" : undefined}
            >
              <div
                className="canvas-sidebar__open"
                onClick={() => renamingId !== canvas.id && props.onSelect(canvas.id)}
              >
                <div className="canvas-sidebar__thumb">
                  {thumbnail && <img src={thumbnail} alt="" />}
                </div>
                <div className="canvas-sidebar__meta">
                  {renamingId === canvas.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(canvas.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitRename(canvas.id);
                        } else if (event.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="canvas-sidebar__name"
                      onDoubleClick={() => startRename(canvas)}
                    >
                      {canvas.name}
                    </span>
                  )}
                  <span className="canvas-sidebar__time">
                    {formatRelativeTime(canvas.updatedAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="canvas-sidebar__menu-button"
                aria-label={`Acciones de ${canvas.name}`}
                onClick={() => setMenuId(menuId === canvas.id ? null : canvas.id)}
              >
                ⋯
              </button>
              {menuId === canvas.id && (
                <div className="canvas-sidebar__menu" role="menu">
                  <button type="button" onClick={() => startRename(canvas)}>
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onDuplicate(canvas.id);
                    }}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onExport(canvas.id);
                    }}
                  >
                    Exportar este canvas
                  </button>
                  <button
                    type="button"
                    className="canvas-sidebar__danger"
                    onClick={() => {
                      setMenuId(null);
                      props.onDelete(canvas.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {props.footer && (
        <div className="canvas-sidebar__footer">{props.footer}</div>
      )}
    </div>
  );
};
```

- [ ] **Step 5: `CanvasSidebar.scss`**

```scss
.canvas-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  padding: 0.75rem;
  box-sizing: border-box;

  &__new,
  &__footer button {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--default-border-color);
    background: var(--island-bg-color);
    color: var(--text-primary-color);
    cursor: pointer;
  }

  &__new {
    font-weight: 600;
  }

  &__search {
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid var(--default-border-color);
    background: var(--input-bg-color);
    color: var(--text-primary-color);
  }

  &__list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  &__item {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 0.5rem;

    &[aria-current="true"] {
      background: var(--color-surface-primary-container, rgba(105, 101, 219, 0.15));
      outline: 1px solid var(--color-primary, #6965db);
    }
  }

  &__open {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.4rem;
    cursor: pointer;
  }

  &__thumb {
    width: 56px;
    height: 40px;
    flex: none;
    border-radius: 0.3rem;
    background: var(--input-bg-color);
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary-color);
  }

  &__time {
    font-size: 0.75rem;
    color: var(--color-gray-50, #888);
  }

  &__menu-button {
    border: none;
    background: transparent;
    color: var(--text-primary-color);
    cursor: pointer;
    padding: 0.4rem;
  }

  &__menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    padding: 0.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--default-border-color);
    background: var(--island-bg-color);
    box-shadow: var(--shadow-island);

    button {
      text-align: left;
      padding: 0.4rem 0.6rem;
      border: none;
      background: transparent;
      color: var(--text-primary-color);
      cursor: pointer;
      border-radius: 0.3rem;

      &:hover {
        background: var(--button-hover-bg);
      }
    }
  }

  &__danger {
    color: var(--color-danger, #db6965) !important;
  }

  &__footer {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  &__banner {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(219, 105, 101, 0.15);
    color: var(--text-primary-color);
    font-size: 0.8rem;
  }
}
```

- [ ] **Step 6: `CanvasSidebar.tsx` (contenedor)**

```tsx
import React, { useEffect, useState } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import { useAtomValue } from "../../app-jotai";
import {
  canvasIndexAtom,
  currentCanvasIdAtom,
} from "../../data/canvasAtoms";
import {
  createNewCanvas,
  duplicateCanvasAction,
  removeCanvas,
  renameCanvasAction,
  saveCurrentCanvasNow,
  switchCanvas,
} from "../../data/canvasActions";
import { getThumbnails, loadScene, listCanvasFiles } from "../../data/canvasStore";

import { CanvasList } from "./CanvasList";

export const CanvasSidebar = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const index = useAtomValue(canvasIndexAtom);
  const currentId = useAtomValue(currentCanvasIdAtom);
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );

  // refresh thumbnails whenever the list (or any updatedAt) changes
  const signature = index.canvases.map((c) => `${c.id}:${c.updatedAt}`).join();
  useEffect(() => {
    let cancelled = false;
    getThumbnails(index.canvases.map((c) => c.id)).then((map) => {
      if (!cancelled) {
        setThumbnails(map);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!excalidrawAPI) {
    return null;
  }

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error: any) {
      excalidrawAPI.setToast({
        message: error?.message || "No se pudo completar la acción",
        closable: true,
      });
    }
  };

  const exportOne = (id: string) =>
    run(async () => {
      if (id === currentId) {
        await saveCurrentCanvasNow(excalidrawAPI);
      }
      const scene = await loadScene(id);
      if (!scene) {
        throw new Error("El canvas ya no existe");
      }
      const files = Object.fromEntries(
        (await listCanvasFiles(id)).map((file) => [file.id, file]),
      );
      const name = index.canvases.find((c) => c.id === id)?.name ?? "canvas";
      const json = serializeAsJSON(
        scene.elements as any,
        scene.appState as any,
        files,
        "local",
      );
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.excalidraw`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });

  const confirmDelete = (id: string) =>
    run(async () => {
      const name = index.canvases.find((c) => c.id === id)?.name ?? "";
      const confirmed = await openConfirmModal({
        title: "Borrar canvas",
        description: <>{`Se va a borrar "${name}" y sus imágenes. No se puede deshacer.`}</>,
        actionLabel: "Borrar",
        color: "danger",
      });
      if (confirmed) {
        await removeCanvas(excalidrawAPI, id);
      }
    });

  return (
    <CanvasList
      canvases={index.canvases}
      currentId={currentId}
      thumbnails={thumbnails}
      onSelect={(id) => run(() => switchCanvas(excalidrawAPI, id))}
      onCreate={() => run(() => createNewCanvas(excalidrawAPI))}
      onRename={(id, name) => run(() => renameCanvasAction(id, name))}
      onDuplicate={(id) => run(() => duplicateCanvasAction(excalidrawAPI, id))}
      onDelete={confirmDelete}
      onExport={exportOne}
    />
  );
};
```

Verify while implementing: `useExcalidrawAPI` is exported from `@excalidraw/excalidraw` (App.tsx imports it the same way); `serializeAsJSON` signature in `packages/excalidraw/data/json.ts` (adjust the arguments/casts to match); `openConfirmModal`'s argument shape from the existing `shareableLinkConfirmDialog` in `App.tsx`; `setToast` options. Fix any type mismatch rather than casting blindly.

- [ ] **Step 7: Add the tab to `AppSidebar.tsx`**

In `components/AppSidebar.tsx`:

```tsx
import { CanvasSidebar } from "./CanvasSidebar/CanvasSidebar";

const canvasListIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
  </svg>
);
```

Inside `<DefaultSidebar.TabTriggers>` add as the first trigger:

```tsx
        <Sidebar.TabTrigger
          tab="canvases"
          style={{ opacity: openSidebar?.tab === "canvases" ? 1 : 0.4 }}
        >
          {canvasListIcon}
        </Sidebar.TabTrigger>
```
and after `</DefaultSidebar.TabTriggers>` add:

```tsx
      <Sidebar.Tab tab="canvases">
        <CanvasSidebar />
      </Sidebar.Tab>
```

- [ ] **Step 8: Mark the editor ready in `App.tsx`**

In the startup effect from Task 4, right after `initialStatePromiseRef.current.promise.resolve(data.scene);` add `setCanvasEditorReady(true);` (import it from `./data/canvasActions`). Also call `setCanvasEditorReady(false)` in that effect's cleanup function.

- [ ] **Step 9: Run tests, typecheck, lint, commit**

```bash
yarn vitest run excalidraw-app/tests/CanvasList.test.tsx --watch=false
yarn test:typecheck && yarn fix
git add excalidraw-app
git commit -m "feat(app): add canvas list sidebar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `CanvasList` tests PASS; typecheck clean.

---

### Task 7: Importar siempre como canvas nuevo (archivo, drag & drop, links)

**Files:**
- Create: `excalidraw-app/data/canvasImport.ts`
- Test: `excalidraw-app/tests/canvasImport.test.ts`
- Modify: `excalidraw-app/App.tsx` (`initializeScene`, efecto de inicio, `onHashChange`, listener de drop)
- Modify: `excalidraw-app/components/AppMainMenu.tsx`
- Modify: `excalidraw-app/components/CanvasSidebar/CanvasSidebar.tsx` (botón "Importar archivo")

**Interfaces:**
- Consumes: `createCanvas`, `toStoredScene` (Task 1), `switchCanvas`, `createNewCanvas` (Task 5), `loadFromBlob` (`@excalidraw/excalidraw/data/blob`).
- Produces:
  - `isExcalidrawSceneFile: (file: File) => boolean`
  - `importFileAsCanvas: (api: ExcalidrawImperativeAPI, file: File) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `excalidraw-app/tests/canvasImport.test.ts`:

```ts
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { newElement } from "@excalidraw/element";

import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { setCanvasEditorReady } from "../data/canvasActions";
import {
  importFileAsCanvas,
  isExcalidrawSceneFile,
} from "../data/canvasImport";
import {
  createCanvas,
  getActiveCanvasId,
  getIndex,
  loadScene,
  resetCanvasStoreForTests,
} from "../data/canvasStore";
import { LocalData } from "../data/LocalData";

vi.mock("../data/canvasThumbnail", () => ({
  generateThumbnail: vi.fn().mockResolvedValue(null),
}));

const makeApi = () =>
  ({
    getSceneElementsIncludingDeleted: () => [],
    getAppState: () => getDefaultAppState() as unknown as AppState,
    getFiles: () => ({}),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
    setToast: vi.fn(),
    history: { clear: vi.fn() },
  }) as unknown as ExcalidrawImperativeAPI;

describe("canvasImport", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
    LocalData.fileStorage.reset();
    setCanvasEditorReady(true);
  });

  afterEach(() => setCanvasEditorReady(false));

  it("recognises scene files by extension or mime type", () => {
    expect(isExcalidrawSceneFile(new File(["{}"], "dibujo.excalidraw"))).toBe(true);
    expect(isExcalidrawSceneFile(new File(["{}"], "foto.png", { type: "image/png" }))).toBe(false);
    expect(
      isExcalidrawSceneFile(
        new File(["{}"], "x.json", { type: "application/vnd.excalidraw+json" }),
      ),
    ).toBe(true);
  });

  it("imports a .excalidraw file as a new canvas and opens it, keeping the current one", async () => {
    const current = await createCanvas({ name: "Actual", activate: true });
    const rect = newElement({ type: "rectangle", x: 0, y: 0, width: 5, height: 5 });
    const json = serializeAsJSON([rect], getDefaultAppState() as AppState, {}, "local");
    const api = makeApi();

    await importFileAsCanvas(api, new File([json], "Mi dibujo.excalidraw"));

    const index = await getIndex();
    expect(index.canvases.map((c) => c.name)).toEqual(["Actual", "Mi dibujo"]);
    const imported = index.canvases[1];
    expect(getActiveCanvasId()).toBe(imported.id);
    expect((await loadScene(imported.id))?.elements).toHaveLength(1);
    expect((await loadScene(current.id))?.elements).toHaveLength(0);
    expect(api.updateScene).toHaveBeenCalled();
  });

  it("rejects an invalid file without creating a canvas", async () => {
    await createCanvas({ activate: true });
    await expect(
      importFileAsCanvas(makeApi(), new File(["no es json"], "roto.excalidraw")),
    ).rejects.toThrow();
    expect((await getIndex()).canvases).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run excalidraw-app/tests/canvasImport.test.ts --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `canvasImport.ts`**

```ts
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
```

If `MIME_TYPES` is not exported from `@excalidraw/common`, import it from where `packages/excalidraw/data/blob.ts` imports it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run excalidraw-app/tests/canvasImport.test.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Links `#json` / `#url` create a new canvas (`App.tsx`)**

1. Extend the return type of `initializeScene` with `& { importAsNewCanvas?: boolean }` (intersect the whole promise result type).
2. In the `if (isExternalScene) {` block remove the overwrite confirmation: delete the `if (!scene.elements.length || roomLinkData || (await openConfirmModal(shareableLinkConfirmDialog))) {` wrapper and its whole `else { ... }` branch (the `document.hidden` focus retry and `roomLinkData = null`), keeping the body (`if (jsonBackendMatch) {...}`, `scene.scrollToContent = true;`, the `replaceState`). Shared links no longer overwrite anything, so no prompt is needed.
3. In the `else if (externalUrlMatch)` branch replace
```ts
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
```
   with `return { scene: data, isExternalScene, importAsNewCanvas: true };`.
4. In the final `else if (scene)` return, add `importAsNewCanvas: !!jsonBackendMatch` to both objects it can return for non-room scenes (`jsonBackendMatch` case → `true`, plain case → `false`).
5. Remove `shareableLinkConfirmDialog` and the `openConfirmModal`/`Trans`/etc. imports that become unused (tsc/eslint will list them).
6. Startup effect: before `initialStatePromiseRef.current.promise.resolve(data.scene)` add
```ts
        if (data.importAsNewCanvas) {
          // the editor is still empty, so nothing of the previous canvas can be overwritten
          await createCanvas({ activate: true });
          await refreshCanvasState();
        }
```
   (import `createCanvas` from `./data/canvasStore`).
7. `onHashChange`: inside `initializeScene({ collabAPI, excalidrawAPI }).then((data) => {` make the callback `async` and, before `loadImages(data);`, add
```ts
          if (data.importAsNewCanvas) {
            await createNewCanvas(excalidrawAPI);
          }
```
   (import `createNewCanvas` from `./data/canvasActions`). The existing `updateScene` that follows fills the new empty canvas.

- [ ] **Step 6: Dropped `.excalidraw` files become canvases (`App.tsx`)**

Add an effect in `ExcalidrawWrapper`:

```tsx
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    // capture phase: runs before the editor, which would replace the scene
    const onDrop = async (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        isExcalidrawSceneFile,
      );
      if (!files.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      for (const file of files) {
        try {
          await importFileAsCanvas(excalidrawAPI, file);
        } catch (error: any) {
          excalidrawAPI.setToast({
            message: error?.message || "No se pudo importar el archivo",
            closable: true,
          });
        }
      }
    };
    window.addEventListener("drop", onDrop, true);
    return () => window.removeEventListener("drop", onDrop, true);
  }, [excalidrawAPI]);
```
(import `importFileAsCanvas`, `isExcalidrawSceneFile` from `./data/canvasImport`). PNG/SVG with embedded scenes keep the library's behavior.

- [ ] **Step 7: Replace "Abrir" by "Abrir como canvas nuevo"**

1. `App.tsx` `UIOptions.canvasActions`: add `loadScene: false,` so Ctrl+O and the library's button can't replace the open canvas.
2. `components/AppMainMenu.tsx`: remove `<MainMenu.DefaultItems.LoadScene />` and add in its place an item that opens a hidden file input handled by the same flow. Implement it with a shared helper in `CanvasSidebar.tsx`... To avoid duplicating UI logic, export from `data/canvasImport.ts`:

```ts
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
```
   and in `AppMainMenu`, using `useExcalidrawAPI()`:

```tsx
      <MainMenu.Item
        icon={LoadIcon}
        onSelect={() => api && pickAndImportFiles(api).catch((e) => api.setToast({ message: e.message, closable: true }))}
        data-testid="load-button"
        shortcut={getShortcutFromShortcutName("loadScene")}
        aria-label="Abrir como canvas nuevo"
      >
        Abrir como canvas nuevo
      </MainMenu.Item>
```
   Take `LoadIcon` and `getShortcutFromShortcutName` from wherever `MainMenu.DefaultItems.LoadScene` imports them (`packages/excalidraw/components/main-menu/DefaultItems.tsx`); if the shortcut import is not available from the app, drop the `shortcut` prop. Update any snapshot that listed the menu (`yarn test:update` regenerates; review the diff).
3. `CanvasSidebar.tsx`: add a footer button using the same helper:

```tsx
      footer={
        <button type="button" onClick={() => run(() => pickAndImportFiles(excalidrawAPI))}>
          Importar archivo
        </button>
      }
```

- [ ] **Step 8: Typecheck, lint, tests, commit**

```bash
yarn test:typecheck && yarn fix && yarn vitest run excalidraw-app --watch=false
git add excalidraw-app
git commit -m "feat(app): import files and shared links as new canvases" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Backup en el sidebar, avisos y pulido

**Files:**
- Modify: `excalidraw-app/components/CanvasSidebar/CanvasSidebar.tsx`
- Modify: `excalidraw-app/components/CanvasSidebar/CanvasList.tsx` (prop `banners?: React.ReactNode`)
- Test: añadir casos a `excalidraw-app/tests/CanvasList.test.tsx`

**Interfaces:**
- Consumes: `downloadBackup`, `parseBackup`, `importBackup` (Task 3), `saveCurrentCanvasNow` (Task 5), `canvasStorageUnavailableAtom`, `canvasSaveErrorAtom`, `refreshCanvasState` (Task 4), `localStorageQuotaExceededAtom` (`data/LocalData`).
- Produces: `CanvasList` acepta `banners?: React.ReactNode`, renderizado arriba de la lista dentro de `.canvas-sidebar`.

- [ ] **Step 1: Failing test for banners**

Append to `tests/CanvasList.test.tsx` inside `describe("CanvasList", ...)`:

```tsx
  it("renders banners and footer slots", () => {
    setup({
      banners: <div>sin espacio</div>,
      footer: <button type="button">Exportar todos</button>,
    });
    expect(screen.getByText("sin espacio")).toBeTruthy();
    expect(screen.getByText("Exportar todos")).toBeTruthy();
  });
```

Run: `yarn vitest run excalidraw-app/tests/CanvasList.test.tsx --watch=false` → FAIL (`banners` prop unknown / not rendered).

- [ ] **Step 2: Add the `banners` slot**

In `CanvasList.tsx` add `banners?: React.ReactNode;` to `CanvasListProps` and render `{props.banners}` right after the search `<input>` and before `<ul>`.

Run the test again → PASS.

- [ ] **Step 3: Backup buttons and status banners in `CanvasSidebar.tsx`**

Add to the component:

```tsx
  const storageUnavailable = useAtomValue(canvasStorageUnavailableAtom);
  const saveError = useAtomValue(canvasSaveErrorAtom);
  const quotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const exportAll = () =>
    run(async () => {
      await saveCurrentCanvasNow(excalidrawAPI);
      await downloadBackup();
    });

  const importBackupFile = () =>
    run(
      () =>
        new Promise<void>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = async () => {
            try {
              const file = input.files?.[0];
              if (file) {
                // validates everything before writing anything
                await importBackup(parseBackup(await file.text()));
                await refreshCanvasState();
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          input.click();
        }),
    );
```

and pass to `CanvasList`:

```tsx
      banners={
        <>
          {storageUnavailable && (
            <div className="canvas-sidebar__banner">
              El almacenamiento del navegador no está disponible: solo se puede
              usar un canvas y no se guardará.
            </div>
          )}
          {quotaExceeded && (
            <div className="canvas-sidebar__banner">
              Sin espacio. Exportá un backup y borrá canvas viejos.
            </div>
          )}
          {saveError && !quotaExceeded && (
            <div className="canvas-sidebar__banner">
              No guardado: los últimos cambios siguen solo en memoria.
            </div>
          )}
        </>
      }
      footer={
        <>
          <button type="button" onClick={() => run(() => pickAndImportFiles(excalidrawAPI))}>
            Importar archivo
          </button>
          <button type="button" onClick={exportAll}>Exportar todos</button>
          <button type="button" onClick={importBackupFile}>Importar backup</button>
        </>
      }
```
(replacing the footer from Task 7). Imports: `downloadBackup, importBackup, parseBackup` from `../../data/canvasBackup`; `canvasStorageUnavailableAtom, canvasSaveErrorAtom, refreshCanvasState` from `../../data/canvasAtoms`; `localStorageQuotaExceededAtom` from `../../data/LocalData`.

- [ ] **Step 4: Full verification and commit**

```bash
yarn test:typecheck
yarn fix
yarn test:update
git status --short   # review any regenerated snapshots before committing
git add excalidraw-app
git commit -m "feat(app): backup buttons and storage status banners" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: typecheck clean, all tests pass (existing `collab`, `MobileMenu`, `LanguageList` plus the new ones).

---

### Task 9: Actualizar el spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-08-multi-canvas-design.md`

- [ ] **Step 1: Reflect the deviations**

Edit the spec so it matches what was built:
- In "Modelo de datos": one database `canvases-db` with key prefixes `index`, `scene:<id>`, `thumb:<id>`, `file:<id>:<fileId>`; `index` holds `{ id, name, createdAt, updatedAt }` (the thumbnail lives under `thumb:<id>`); `index.activeCanvasId` is only the last opened canvas, each tab keeps its own active canvas in memory.
- In "UI": the list is a new "canvases" tab inside the existing default sidebar; the stock "Abrir" (Ctrl+O) is replaced by "Abrir como canvas nuevo".
- In "Varias pestañas": a tab whose canvas was deleted elsewhere keeps its editor content untouched.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-08-multi-canvas-design.md
git commit -m "docs: align multi-canvas spec with the implementation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**
- Modelo de datos + guardado + borrado → Task 1; migración atómica → Task 2; backup → Tasks 3 y 8; `LocalData` sobre el canvas activo → Task 4; cambio de canvas, nuevo, duplicar, borrar, renombrar → Task 5; sidebar (lista, orden por `updatedAt`, miniatura, "hace X", buscador, menú ⋯, doble click, confirmación, exportar uno) → Task 6; import por archivo, drop y links como canvas nuevo → Task 7; errores (IndexedDB no disponible, cuota, fallo de guardado con un reintento, backup inválido, canvas inexistente) → Tasks 1, 2, 4, 6, 8; `tabSync` y canvas borrado en otra pestaña → Task 4; miniaturas → Task 5.
- "Exportar este canvas como `.excalidraw`" → Task 6 (`exportOne`). Fuera de alcance respetado.

**Placeholders:** ninguno; los puntos marcados "verificar al implementar" nombran exactamente qué firma comprobar (`serializeAsJSON`, `openConfirmModal`, `MIME_TYPES`, `LoadIcon`).

**Consistencia de tipos:** `CanvasMeta`/`CanvasIndex`/`CanvasScene` definidos en Task 1 y usados igual después; `createNewCanvas` (Task 5) es el que consumen Task 7 y Task 6; `setCanvasEditorReady` se llama en Task 6 y los tests de Tasks 5 y 7 lo usan igual; `deleteCanvas` devuelve `{ activeCanvasId, deletedWasActive }` en Task 1 y se consume así en Task 5.
