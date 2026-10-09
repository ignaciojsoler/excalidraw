import React, { useEffect, useState } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import { useAtomValue } from "../../app-jotai";
import {
  canvasIndexAtom,
  canvasSaveErrorAtom,
  canvasStorageUnavailableAtom,
  currentCanvasIdAtom,
  refreshCanvasState,
} from "../../data/canvasAtoms";
import {
  downloadBackup,
  importBackup,
  parseBackup,
} from "../../data/canvasBackup";
import {
  createNewCanvas,
  duplicateCanvasAction,
  removeCanvas,
  renameCanvasAction,
  saveCurrentCanvasNow,
  switchCanvas,
} from "../../data/canvasActions";
import {
  getThumbnails,
  loadScene,
  listCanvasFiles,
} from "../../data/canvasStore";

import { pickAndImportFiles } from "../../data/canvasImport";
import { localStorageQuotaExceededAtom } from "../../data/LocalData";

import { CanvasList } from "./CanvasList";

export const CanvasSidebar = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const index = useAtomValue(canvasIndexAtom);
  const currentId = useAtomValue(currentCanvasIdAtom);
  const storageUnavailable = useAtomValue(canvasStorageUnavailableAtom);
  const saveError = useAtomValue(canvasSaveErrorAtom);
  const quotaExceeded = useAtomValue(localStorageQuotaExceededAtom);
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
        scene.elements,
        scene.appState,
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

  const confirmDelete = (id: string) =>
    run(async () => {
      const name = index.canvases.find((c) => c.id === id)?.name ?? "";
      const confirmed = await openConfirmModal({
        title: "Borrar canvas",
        description: (
          <>{`Se va a borrar "${name}" y sus imágenes. No se puede deshacer.`}</>
        ),
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
          <button
            type="button"
            onClick={() => run(() => pickAndImportFiles(excalidrawAPI))}
          >
            Importar archivo
          </button>
          <button type="button" onClick={exportAll}>
            Exportar todos
          </button>
          <button type="button" onClick={importBackupFile}>
            Importar backup
          </button>
        </>
      }
    />
  );
};
