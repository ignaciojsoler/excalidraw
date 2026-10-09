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
    expect(
      (await loadScene(imported[0].id))?.appState.viewBackgroundColor,
    ).toBe("#00ff00");
    expect(await listCanvasFiles(imported[0].id)).toEqual([file]);
  });

  it("adds imported canvases without touching the existing ones", async () => {
    const existing = await createCanvas({ name: "Existente", scene: scene(1) });
    const text = JSON.stringify(await buildBackup());
    await importBackup(parseBackup(text));
    const index = await getIndex();
    expect(index.canvases).toHaveLength(2);
    expect(index.canvases[0].id).toBe(existing.id);
    expect(index.canvases.map((c) => c.name)).toEqual([
      "Existente",
      "Existente",
    ]);
  });

  it.each([
    ["not json", "esto no es json"],
    [
      "wrong type",
      JSON.stringify({ type: "otra-cosa", version: 1, canvases: [] }),
    ],
    [
      "newer version",
      JSON.stringify({ type: BACKUP_TYPE, version: 99, canvases: [] }),
    ],
    [
      "canvases not an array",
      JSON.stringify({ type: BACKUP_TYPE, version: 1, canvases: {} }),
    ],
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
