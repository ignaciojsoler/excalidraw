import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useCreatePortalContainer } from "@excalidraw/excalidraw/hooks/useCreatePortalContainer";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import { useAtomValue } from "../../app-jotai";
import {
  canvasIndexAtom,
  galleryOpenAtom,
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

import { CanvasGallery } from "./CanvasGallery";

/**
 * Rendered in `document.body` (like the editor's modals) so that the editor
 * can be made `inert` while the gallery is open without affecting the gallery
 * or the confirm dialogs.
 */
const GalleryPortal = (props: { children: React.ReactNode }) => {
  const container = useCreatePortalContainer({
    className: "canvas-gallery-portal",
  });
  return container ? createPortal(props.children, container) : null;
};

export const CanvasGalleryScreen = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const { t } = useI18n();
  const galleryOpen = useAtomValue(galleryOpenAtom);
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

  if (!excalidrawAPI || !galleryOpen) {
    return null;
  }

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error: any) {
      excalidrawAPI.setToast({
        message: error?.message || t("canvases.errors.actionFailed"),
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
        throw new Error(t("canvases.errors.notFound"));
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
        title: t("canvases.deleteTitle"),
        description: <>{t("canvases.deleteDescription", { name })}</>,
        actionLabel: t("canvases.delete"),
        color: "danger",
      });
      if (confirmed) {
        await removeCanvas(excalidrawAPI, id);
      }
    });

  return (
    <GalleryPortal>
      <CanvasGallery
        canvases={index.canvases}
        currentId={currentId}
        thumbnails={thumbnails}
        onSelect={(id) => run(() => switchCanvas(excalidrawAPI, id))}
        onCreate={() => run(() => createNewCanvas(excalidrawAPI))}
        onRename={(id, name) => run(() => renameCanvasAction(id, name))}
        onDuplicate={(id) =>
          run(() => duplicateCanvasAction(excalidrawAPI, id))
        }
        onDelete={confirmDelete}
        onExport={exportOne}
        banners={
          <>
            {storageUnavailable && (
              <div className="canvas-gallery__banner">
                {t("canvases.banner.storageUnavailable")}
              </div>
            )}
            {quotaExceeded && (
              <div className="canvas-gallery__banner">
                {t("canvases.banner.quota")}
              </div>
            )}
            {saveError && !quotaExceeded && (
              <div className="canvas-gallery__banner">
                {t("canvases.banner.saveError")}
              </div>
            )}
          </>
        }
        headerActions={
          <>
            <button
              type="button"
              onClick={() => run(() => pickAndImportFiles(excalidrawAPI))}
            >
              {t("canvases.importFile")}
            </button>
            <button type="button" onClick={exportAll}>
              {t("canvases.exportAll")}
            </button>
            <button type="button" onClick={importBackupFile}>
              {t("canvases.importBackup")}
            </button>
          </>
        }
      />
    </GalleryPortal>
  );
};
