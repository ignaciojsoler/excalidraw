import React, { useState } from "react";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { formatRelativeTime } from "./formatRelativeTime";

import "./CanvasGallery.scss";

import type { CanvasMeta } from "../../data/canvasStore";

type CanvasGalleryProps = {
  canvases: readonly CanvasMeta[];
  currentId: string | null;
  thumbnails: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  footer?: React.ReactNode;
  banners?: React.ReactNode;
  headerActions?: React.ReactNode;
};

export const CanvasGallery = (props: CanvasGalleryProps) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const visible = [...props.canvases]
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const startRename = (canvas: CanvasMeta) => {
    setMenuId(null);
    setDraft(canvas.name);
    setRenamingId(canvas.id);
  };

  const commitRename = (id: string) => {
    const name = draft.trim();
    setRenamingId(null);
    if (name) {
      props.onRename(id, name);
    }
  };

  // the editor listens on `document`; React already stopped the native event
  // at the root, so this keeps keys/paste away from the hidden editor while
  // leaving the default behavior (typing, pasting) inside the inputs intact
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  // like the editor's own menus: close on outside click or Escape
  const closeMenuOnOutsidePointer = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (
      menuId &&
      !target.closest(".canvas-gallery__menu, .canvas-gallery__menu-button")
    ) {
      setMenuId(null);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      setMenuId(null);
    }
  };

  return (
    <div
      className="canvas-gallery"
      role="dialog"
      aria-label={t("canvases.title")}
      onKeyDown={onKeyDown}
      onKeyUp={stop}
      onPointerDown={closeMenuOnOutsidePointer}
      onPaste={stop}
    >
      <div className="canvas-gallery__header">
        <h1>{t("canvases.title")}</h1>
        <button
          type="button"
          className="canvas-gallery__new"
          onClick={props.onCreate}
        >
          {t("canvases.new")}
        </button>
        {props.headerActions}
        <input
          className="canvas-gallery__search"
          type="search"
          placeholder={t("canvases.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {props.banners}
      {query.trim() && !visible.length && <p>{t("canvases.empty")}</p>}
      <ul className="canvas-gallery__grid">
        {visible.map((canvas) => {
          const thumbnail = props.thumbnails.get(canvas.id);
          return (
            <li
              key={canvas.id}
              className="canvas-gallery__item"
              aria-current={canvas.id === props.currentId ? "true" : undefined}
            >
              <div
                className="canvas-gallery__open"
                onClick={() =>
                  renamingId !== canvas.id && props.onSelect(canvas.id)
                }
              >
                <div className="canvas-gallery__thumb">
                  {thumbnail && <img src={thumbnail} alt="" />}
                </div>
                <div className="canvas-gallery__meta">
                  {renamingId === canvas.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(canvas.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitRename(canvas.id);
                        } else if (event.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="canvas-gallery__name"
                      onDoubleClick={() => startRename(canvas)}
                    >
                      {canvas.name}
                    </span>
                  )}
                  <span className="canvas-gallery__time">
                    {formatRelativeTime(canvas.updatedAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="canvas-gallery__menu-button"
                aria-label={t("canvases.actions", { name: canvas.name })}
                onClick={() =>
                  setMenuId(menuId === canvas.id ? null : canvas.id)
                }
              >
                ⋯
              </button>
              {menuId === canvas.id && (
                <div className="canvas-gallery__menu" role="menu">
                  <button type="button" onClick={() => startRename(canvas)}>
                    {t("canvases.rename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onDuplicate(canvas.id);
                    }}
                  >
                    {t("canvases.duplicate")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onExport(canvas.id);
                    }}
                  >
                    {t("canvases.exportOne")}
                  </button>
                  <button
                    type="button"
                    className="canvas-gallery__danger"
                    onClick={() => {
                      setMenuId(null);
                      props.onDelete(canvas.id);
                    }}
                  >
                    {t("canvases.delete")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {props.footer && (
        <div className="canvas-gallery__footer">{props.footer}</div>
      )}
    </div>
  );
};
