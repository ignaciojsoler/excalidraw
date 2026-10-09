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

  it("names new canvases Untitled, Untitled 2, ...", async () => {
    expect(getNextUntitledName([])).toBe("Untitled");
    expect(getNextUntitledName(["Untitled"])).toBe("Untitled 2");
    expect(getNextUntitledName(["Untitled", "Untitled 2"])).toBe("Untitled 3");
    const a = await createCanvas();
    const b = await createCanvas();
    expect([a.name, b.name]).toEqual(["Untitled", "Untitled 2"]);
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
    expect(b.name).toBe("Original (copy)");
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
