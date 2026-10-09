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
  } as BinaryFileData);

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
    const rect = newElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });

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
