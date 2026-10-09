import { appJotaiStore, atom } from "../app-jotai";

import { getActiveCanvasId, getIndex } from "./canvasStore";

import type { CanvasIndex } from "./canvasStore";

export const canvasIndexAtom = atom<CanvasIndex>({
  canvases: [],
  activeCanvasId: null,
});

const startsOnExternalScene = () =>
  /^#(room|json|url)=/.test(window.location.hash) ||
  new URLSearchParams(window.location.search).has("id");

/** full-screen gallery shown over the editor; hidden when opening a shared link */
export const galleryOpenAtom = atom(!startsOnExternalScene());

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
