import React, { useState } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { useAtomValue } from "../../app-jotai";
import { renameCanvasAction, showGallery } from "../../data/canvasActions";
import { canvasIndexAtom, currentCanvasIdAtom } from "../../data/canvasAtoms";

import "./CanvasGallery.scss";

export const galleryIcon = (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="5.5" height="5.5" rx="1.25" />
    <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.25" />
    <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.25" />
    <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.25" />
  </svg>
);

type CanvasBreadcrumbViewProps = {
  name: string | undefined;
  isMobile: boolean;
  onHome: () => void;
  onRename: (name: string) => void;
};

/**
 * "▦ Canvases / <name>" next to the main menu. The first segment goes to the
 * gallery; clicking the name renames it in place (the usual convention for a
 * document title).
 */
export const CanvasBreadcrumbView = (props: CanvasBreadcrumbViewProps) => {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(props.name ?? "");
    setEditing(true);
  };

  const commit = () => {
    const name = draft.trim();
    setEditing(false);
    if (name && name !== props.name) {
      props.onRename(name);
    }
  };

  return (
    <nav className="canvas-breadcrumb">
      <button
        type="button"
        className="canvas-breadcrumb__home"
        title={t("canvases.back")}
        aria-label={t("canvases.back")}
        onClick={props.onHome}
      >
        <span className="canvas-breadcrumb__icon">{galleryIcon}</span>
        {!props.isMobile && <span>{t("canvases.breadcrumbHome")}</span>}
      </button>
      {props.name !== undefined && (
        <>
          <span className="canvas-breadcrumb__separator" aria-hidden="true">
            /
          </span>
          {editing ? (
            <input
              className="canvas-breadcrumb__input"
              autoFocus
              value={draft}
              size={Math.max(draft.length, 4)}
              aria-label={t("canvases.renameCurrent")}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                // typing a name must not trigger the editor's shortcuts
                event.stopPropagation();
                if (event.key === "Enter") {
                  commit();
                } else if (event.key === "Escape") {
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="canvas-breadcrumb__name"
              title={t("canvases.renameCurrent")}
              aria-label={t("canvases.renameCurrent")}
              onClick={startEditing}
            >
              {props.name}
            </button>
          )}
        </>
      )}
    </nav>
  );
};

export const CanvasBreadcrumb = ({ isMobile }: { isMobile: boolean }) => {
  const api = useExcalidrawAPI();
  const index = useAtomValue(canvasIndexAtom);
  const currentId = useAtomValue(currentCanvasIdAtom);
  const name = index.canvases.find((c) => c.id === currentId)?.name;

  const run = (action: () => Promise<void>) =>
    action().catch((error) =>
      api?.setToast({ message: error?.message, closable: true }),
    );

  return (
    <CanvasBreadcrumbView
      name={name}
      isMobile={isMobile}
      onHome={() => api && run(() => showGallery(api))}
      onRename={(newName) =>
        currentId && run(() => renameCanvasAction(currentId, newName))
      }
    />
  );
};
