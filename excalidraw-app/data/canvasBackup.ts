import { t } from "@excalidraw/excalidraw/i18n";

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

const invalid = (reasonKey: Parameters<typeof t>[0]) =>
  new Error(t("canvases.errors.backupInvalid", { reason: t(reasonKey) }));

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseBackup = (text: string): CanvasBackup => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid("canvases.errors.backupNotJson");
  }
  if (!isObject(data) || data.type !== BACKUP_TYPE) {
    throw invalid("canvases.errors.backupNotBackup");
  }
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
    throw invalid("canvases.errors.backupVersion");
  }
  if (!Array.isArray(data.canvases)) {
    throw invalid("canvases.errors.backupNoList");
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
      throw invalid("canvases.errors.backupCanvasIncomplete");
    }
    for (const file of canvas.files) {
      if (
        !isObject(file) ||
        typeof file.id !== "string" ||
        typeof file.mimeType !== "string" ||
        typeof file.dataURL !== "string"
      ) {
        throw invalid("canvases.errors.backupImageIncomplete");
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
  link.download = `excalidraw-canvases-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
