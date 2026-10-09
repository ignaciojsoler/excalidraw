import React, { useState } from "react";

import { formatRelativeTime } from "./formatRelativeTime";

import "./CanvasSidebar.scss";

import type { CanvasMeta } from "../../data/canvasStore";

type CanvasListProps = {
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
};

export const CanvasList = (props: CanvasListProps) => {
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

  return (
    <div className="canvas-sidebar">
      <button
        type="button"
        className="canvas-sidebar__new"
        onClick={props.onCreate}
      >
        + Nuevo canvas
      </button>
      <input
        className="canvas-sidebar__search"
        type="search"
        placeholder="Buscar canvas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {props.banners}
      <ul className="canvas-sidebar__list">
        {visible.map((canvas) => {
          const thumbnail = props.thumbnails.get(canvas.id);
          return (
            <li
              key={canvas.id}
              className="canvas-sidebar__item"
              aria-current={canvas.id === props.currentId ? "true" : undefined}
            >
              <div
                className="canvas-sidebar__open"
                onClick={() =>
                  renamingId !== canvas.id && props.onSelect(canvas.id)
                }
              >
                <div className="canvas-sidebar__thumb">
                  {thumbnail && <img src={thumbnail} alt="" />}
                </div>
                <div className="canvas-sidebar__meta">
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
                      className="canvas-sidebar__name"
                      onDoubleClick={() => startRename(canvas)}
                    >
                      {canvas.name}
                    </span>
                  )}
                  <span className="canvas-sidebar__time">
                    {formatRelativeTime(canvas.updatedAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="canvas-sidebar__menu-button"
                aria-label={`Acciones de ${canvas.name}`}
                onClick={() =>
                  setMenuId(menuId === canvas.id ? null : canvas.id)
                }
              >
                ⋯
              </button>
              {menuId === canvas.id && (
                <div className="canvas-sidebar__menu" role="menu">
                  <button type="button" onClick={() => startRename(canvas)}>
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onDuplicate(canvas.id);
                    }}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      props.onExport(canvas.id);
                    }}
                  >
                    Exportar este canvas
                  </button>
                  <button
                    type="button"
                    className="canvas-sidebar__danger"
                    onClick={() => {
                      setMenuId(null);
                      props.onDelete(canvas.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {props.footer && (
        <div className="canvas-sidebar__footer">{props.footer}</div>
      )}
    </div>
  );
};
