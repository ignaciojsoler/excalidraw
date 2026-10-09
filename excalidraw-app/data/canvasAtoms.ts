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
