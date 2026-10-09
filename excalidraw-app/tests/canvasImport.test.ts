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
  } as unknown as ExcalidrawImperativeAPI);

describe("canvasImport", () => {
  beforeEach(async () => {
    await resetCanvasStoreForTests();
    LocalData.fileStorage.reset();
    setCanvasEditorReady(true);
  });

  afterEach(() => setCanvasEditorReady(false));

  it("recognises scene files by extension or mime type", () => {
    expect(isExcalidrawSceneFile(new File(["{}"], "dibujo.excalidraw"))).toBe(
      true,
    );
    expect(
      isExcalidrawSceneFile(
        new File(["{}"], "foto.png", { type: "image/png" }),
      ),
    ).toBe(false);
    expect(
      isExcalidrawSceneFile(
        new File(["{}"], "x.json", { type: "application/vnd.excalidraw+json" }),
      ),
    ).toBe(true);
  });

  it("imports a .excalidraw file as a new canvas and opens it, keeping the current one", async () => {
    const current = await createCanvas({ name: "Actual", activate: true });
    const rect = newElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });
    const json = serializeAsJSON(
      [rect],
      getDefaultAppState() as AppState,
      {},
      "local",
    );
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
      importFileAsCanvas(
        makeApi(),
        new File(["no es json"], "roto.excalidraw"),
      ),
    ).rejects.toThrow();
    expect((await getIndex()).canvases).toHaveLength(1);
  });
});
