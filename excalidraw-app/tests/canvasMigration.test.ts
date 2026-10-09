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
  const rect = newElement({
    type: "rectangle",
    x: 1,
    y: 2,
    width: 3,
    height: 4,
  });
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

    expect(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS),
    ).toBeNull();
    expect(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE),
    ).toBeNull();
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
    expect(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS),
    ).not.toBeNull();
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
    expect(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS),
    ).not.toBeNull();
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
