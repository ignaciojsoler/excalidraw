import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newElement } from "@excalidraw/element";

import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { appJotaiStore } from "../app-jotai";
import { galleryOpenAtom } from "../data/canvasAtoms";
import {
  createNewCanvas,
  duplicateCanvasAction,
  removeCanvas,
  setCanvasEditorReady,
  showGallery,
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

    LocalData.save(
      [rect(), rect(), rect()],
      getDefaultAppState() as AppState,
      {},
      () => {},
    );
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

  it("createNewCanvas opens a new empty canvas named Untitled 2", async () => {
    const a = await createCanvas({ activate: true });
    const { api, getElements } = makeApi([rect()]);

    await createNewCanvas(api);

    const index = await getIndex();
    expect(index.canvases.map((c) => c.name)).toEqual([
      "Untitled",
      "Untitled 2",
    ]);
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
    expect(copy.name).toBe("Untitled (copy)");
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

  it("switchCanvas closes the gallery, also when the target is already open", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const { api } = makeApi();

    appJotaiStore.set(galleryOpenAtom, true);
    await switchCanvas(api, a.id);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
    expect(api.updateScene).not.toHaveBeenCalled();

    appJotaiStore.set(galleryOpenAtom, true);
    await switchCanvas(api, b.id);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });

  it("createNewCanvas closes the gallery", async () => {
    await createCanvas({ activate: true });
    const { api } = makeApi();
    appJotaiStore.set(galleryOpenAtom, true);
    await createNewCanvas(api);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });

  it("showGallery saves the open canvas before opening the gallery", async () => {
    const a = await createCanvas({ activate: true });
    const { api } = makeApi([rect(), rect()]);
    appJotaiStore.set(galleryOpenAtom, false);

    await showGallery(api);

    expect((await loadScene(a.id))?.elements).toHaveLength(2);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(true);
  });

  it("showGallery does nothing before the editor is ready", async () => {
    await createCanvas({ activate: true });
    const { api } = makeApi();
    setCanvasEditorReady(false);
    appJotaiStore.set(galleryOpenAtom, false);
    await showGallery(api);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });

  it("switchCanvas keeps the app theme instead of the one stored in the canvas", async () => {
    await createCanvas({ activate: true });
    const b = await createCanvas({
      scene: { elements: [rect()], appState: { theme: "dark" } },
    });
    const { api } = makeApi();

    await switchCanvas(api, b.id);

    const update = (api.updateScene as any).mock.calls[0][0];
    expect(update.appState.theme).toBe(api.getAppState().theme);
    expect(update.appState.theme).toBe("light");
  });
});
