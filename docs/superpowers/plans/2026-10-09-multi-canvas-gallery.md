# Multi-canvas: galería e i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sidebar de canvas por una galería a pantalla completa que se muestra siempre al abrir la app, y pasar todos los textos de la feature al sistema de traducciones.

**Architecture:** La capa de datos y las acciones (Tasks 1 a 5 del plan anterior) no cambian. Un átomo `galleryOpenAtom` decide si se ve la galería (overlay sobre el editor, que sigue montado). `switchCanvas`/`createNewCanvas` cierran la galería; un botón "← Canvases" en el editor la reabre guardando antes el canvas y su miniatura. Los textos pasan a claves `canvases.*` en `en.json` y `es-ES.json`.

**Tech Stack:** TypeScript, React, jotai (`../app-jotai`), `t()` / `useI18n()` de `@excalidraw/excalidraw/i18n`, vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-10-08-multi-canvas-design.md` (sección "UI" actualizada).
**Plan anterior:** `docs/superpowers/plans/2026-10-08-multi-canvas.md`

## Global Constraints

- Galería simple: sin carpetas ni colecciones. Se muestra **siempre al abrir**, salvo que la URL traiga `#room=`, `#json=`, `#url=` o `?id=`, que van directo al editor.
- Se elimina el tab "canvases" del `DefaultSidebar`. Todo el estado de datos sigue en `canvasStore`.
- Ningún texto visible ni mensaje de error de la feature queda hardcodeado: todo va por `t()` con claves `canvases.*`. `en.json` es la fuente; `es-ES.json` lleva la traducción; el resto de idiomas cae a inglés.
- Esta es la única excepción a "no modificar `packages/`": solo `packages/excalidraw/locales/en.json` y `es-ES.json`.
- Nombres por defecto: `t("canvases.untitled")`, `"… 2"`, `"… 3"`; migración: `t("canvases.firstCanvas")`; duplicado: `t("canvases.copyName", { name })`. Los nombres quedan guardados en el idioma activo al crearlos.
- Mientras la galería está abierta, ninguna tecla ni pegado puede llegar al editor oculto (Supr no debe borrar elementos).
- Tras cada task: `yarn test:typecheck`, `yarn fix` (revertir cualquier reformateo que haga prettier sobre `docs/`), sus tests y un commit con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Antes de terminar: `yarn test:update` y `yarn test:code`.

## Review Focus

1. Teclas y pegado con la galería abierta no afectan al editor oculto. → Task 2 (test).
2. Click en el canvas que ya está abierto cierra la galería sin recargar nada. → Task 2.
3. Links `#room` / `#json` / `#url` y archivos importados saltan la galería y dejan el editor visible. → Task 2.
4. Volver a la galería guarda el canvas actual (con miniatura) antes de mostrarla; las miniaturas se ven al día. → Task 2.
5. Sin claves faltantes: cada clave `canvases.*` usada existe en `en.json` y `es-ES.json`. → Task 1 (test).

---

### Task 1: Traducciones

**Files:**
- Modify: `packages/excalidraw/locales/en.json`, `packages/excalidraw/locales/es-ES.json` (agregar el objeto `"canvases"` al nivel superior, en orden alfabético respecto de sus vecinos si el archivo lo mantiene)
- Modify: `excalidraw-app/data/canvasStore.ts`, `canvasMigration.ts`, `canvasBackup.ts`, `canvasActions.ts`, `canvasImport.ts`
- Modify: `excalidraw-app/components/CanvasSidebar/*.tsx`, `formatRelativeTime.ts`, `components/AppMainMenu.tsx`, `App.tsx` (toast de drop)
- Modify: los tests que esperan textos (`canvasStore`, `canvasMigration`, `canvasActions`, `canvasImport`, `CanvasList`, `canvasBackup` si compara mensajes)
- Test: `excalidraw-app/tests/canvasTranslations.test.ts`

**Interfaces:**
- Produces: claves `canvases.*` listadas abajo. `DEFAULT_CANVAS_NAME` deja de existir como constante; `getNextUntitledName(names)` usa `t("canvases.untitled")` como base. `formatRelativeTime(timestamp, now?)` mantiene su firma y devuelve texto traducido.

Claves (inglés; el implementador traduce las mismas claves al español en `es-ES.json`: "Mis canvas", "+ Nuevo canvas", "Sin título", etc., según el texto que hoy está hardcodeado):

```json
"canvases": {
  "title": "My canvases",
  "new": "+ New canvas",
  "search": "Search canvases",
  "empty": "No canvases match your search",
  "untitled": "Untitled",
  "firstCanvas": "Canvas 1",
  "copyName": "{{name}} (copy)",
  "back": "← Canvases",
  "actions": "Actions for {{name}}",
  "rename": "Rename",
  "duplicate": "Duplicate",
  "exportOne": "Export this canvas",
  "delete": "Delete",
  "deleteTitle": "Delete canvas",
  "deleteDescription": "\"{{name}}\" and its images will be deleted. This can't be undone.",
  "importFile": "Import file",
  "exportAll": "Export all",
  "importBackup": "Import backup",
  "openAsNew": "Open as new canvas",
  "time": {
    "now": "just now",
    "minutes": "{{count}} min ago",
    "hours": "{{count}} h ago",
    "days": "{{count}} d ago"
  },
  "banner": {
    "storageUnavailable": "Browser storage is not available: only one canvas can be used and it won't be saved.",
    "quota": "Out of space. Export a backup and delete old canvases.",
    "saveError": "Not saved: your latest changes only live in memory."
  },
  "errors": {
    "actionFailed": "Couldn't complete the action",
    "importFailed": "Couldn't import the file",
    "notFound": "The canvas no longer exists",
    "openFailed": "Couldn't open the canvas: it no longer exists",
    "migrationFailed": "Canvas migration failed verification",
    "backupInvalid": "Invalid backup file: {{reason}}",
    "backupNotJson": "it is not JSON",
    "backupNotBackup": "it is not a canvas backup",
    "backupVersion": "unsupported version",
    "backupNoList": "the canvas list is missing",
    "backupCanvasIncomplete": "a canvas is incomplete",
    "backupImageIncomplete": "an image is incomplete"
  }
}
```

- [ ] **Step 1: Write the failing test**

Create `excalidraw-app/tests/canvasTranslations.test.ts`:

```ts
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import en from "../../packages/excalidraw/locales/en.json";
import es from "../../packages/excalidraw/locales/es-ES.json";

const collectKeys = (obj: any, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? collectKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "tests" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

describe("canvases translations", () => {
  const enKeys = collectKeys((en as any).canvases, "canvases.");
  const esKeys = collectKeys((es as any).canvases, "canvases.");

  it("es-ES has exactly the same canvases.* keys as en", () => {
    expect(esKeys.sort()).toEqual(enKeys.sort());
  });

  it("every canvases.* key used in the app exists in en.json", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(__dirname, ".."))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`](canvases\.[A-Za-z.]+)["'`]/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("no Spanish UI literals are left in the feature code", () => {
    const offenders: string[] = [];
    const spanish =
      /(Nuevo canvas|Sin título|Exportar|Importar|Renombrar|Duplicar|Borrar|hace un momento|hace \$\{|Buscar canvas|Acciones de|Abrir como|No se pudo|ya no existe)/;
    for (const file of sourceFiles(join(__dirname, ".."))) {
      if (spanish.test(readFileSync(file, "utf8"))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

If `resolveJsonModule` blocks the JSON imports, read the files with `JSON.parse(readFileSync(...))`.

- [ ] **Step 2: Run it to see it fail**

Run: `yarn vitest run excalidraw-app/tests/canvasTranslations.test.ts --watch=false`
Expected: FAIL.

- [ ] **Step 3: Add keys and replace every literal**

Add the `"canvases"` object to both locale files. Then replace every hardcoded string in the files listed above:
- React components: `const { t } = useI18n();` and `t("canvases.…")`. Interpolated: `t("canvases.actions", { name })`.
- Plain modules (`canvasStore`, `canvasMigration`, `canvasBackup`, `canvasActions`, `canvasImport`, `formatRelativeTime`): `import { t } from "@excalidraw/excalidraw/i18n";` and call `t()` at call time (never at module load, so a language change applies).
- `parseBackup` errors: `new Error(t("canvases.errors.backupInvalid", { reason: t("canvases.errors.backupNotJson") }))`, etc.
- `AppMainMenu` item: label and `aria-label` from `t("canvases.openAsNew")`.
- `formatRelativeTime`: `now` → `t("canvases.time.now")`; minutes/hours/days → `t("canvases.time.minutes", { count: minutes })` etc. Keep the `toLocaleDateString()` fallback for ≥30 days.
- `getNextUntitledName`: base `t("canvases.untitled")`; `"${base} ${n}"`.
- `duplicateCanvas`: `t("canvases.copyName", { name: source.name })`. `migrateFromLocalStorage`: `t("canvases.firstCanvas")`.
- Remove `DEFAULT_CANVAS_NAME` and fix its imports.

Update existing tests so they expect the English strings (`"Untitled"`, `"Untitled 2"`, `"Canvas 1"`, `"Untitled (copy)"`, `"just now"`, `"5 min ago"`, `"3 h ago"`, `"2 d ago"`, `"Search canvases"`, `"+ New canvas"`, `"Rename"`, `"Duplicate"`, `"Export this canvas"`, `"Delete"`, `"Actions for Viejo"`…). Do not weaken any assertion.

- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
yarn vitest run excalidraw-app --watch=false
yarn test:typecheck && yarn fix && yarn test:code
git add packages/excalidraw/locales excalidraw-app
git commit -m "feat(app): translate the canvas UI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: all pass, including `canvasTranslations`.

---

### Task 2: Galería a pantalla completa

**Files:**
- Modify: `excalidraw-app/data/canvasAtoms.ts` (agregar `galleryOpenAtom`)
- Modify: `excalidraw-app/data/canvasActions.ts` (cerrar la galería; `showGallery`)
- Create: `excalidraw-app/components/CanvasGallery/CanvasGallery.tsx` (presentacional; sale de `git mv components/CanvasSidebar/CanvasList.tsx`)
- Create: `excalidraw-app/components/CanvasGallery/CanvasGalleryScreen.tsx` (contenedor; sale de `git mv components/CanvasSidebar/CanvasSidebar.tsx`)
- Create: `excalidraw-app/components/CanvasGallery/BackToGalleryButton.tsx`
- Create: `excalidraw-app/components/CanvasGallery/CanvasGallery.scss` (sale de `git mv CanvasSidebar.scss`)
- Move: `components/CanvasSidebar/formatRelativeTime.ts` → `components/CanvasGallery/formatRelativeTime.ts`
- Modify: `excalidraw-app/components/AppSidebar.tsx` (quitar el tab "canvases" y su ícono)
- Modify: `excalidraw-app/App.tsx` (montar galería y botón; salto de galería con links)
- Modify: `excalidraw-app/data/canvasImport.ts` (nada que cerrar: usa `switchCanvas`)
- Test: `excalidraw-app/tests/CanvasGallery.test.tsx` (sale de `CanvasList.test.tsx`), `excalidraw-app/tests/canvasActions.test.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 1 a 5 del plan anterior y `t()` de la Task 1 de este plan.
- Produces:
  - `galleryOpenAtom: Atom<boolean>` (valor inicial: `false` si `window.location.hash` coincide con `/^#(room|json|url)=/` o `location.search` contiene `id=`; `true` en cualquier otro caso).
  - `showGallery: (api: ExcalidrawImperativeAPI) => Promise<void>`: `await saveCurrentCanvasNow(api, { withThumbnail: true })`, `await refreshCanvasState()`, `appJotaiStore.set(galleryOpenAtom, true)`. No hace nada si el editor no está listo.
  - `switchCanvas(api, id)` ahora, cuando el editor está listo, **siempre** termina con `appJotaiStore.set(galleryOpenAtom, false)`, también si `id` ya es el activo (en ese caso sin recargar ni guardar nada). `createNewCanvas` la hereda al llamar a `switchCanvas`.
  - `CanvasGallery` props: las de `CanvasList` más `title: string` ya traducido no hace falta (usa `useI18n`); mantiene `banners` y `footer`, y agrega `headerActions?: React.ReactNode` (renderizado junto al botón "+ New canvas").

- [ ] **Step 1: Write the failing tests**

Add to `excalidraw-app/tests/canvasActions.test.ts` (importando `galleryOpenAtom`, `showGallery` y `appJotaiStore` de `../app-jotai`):

```ts
  it("switchCanvas closes the gallery, also when the target is already open", async () => {
    const a = await createCanvas({ activate: true });
    const b = await createCanvas();
    const { api } = makeApi();

    appJotaiStore.set(galleryOpenAtom, true);
    await switchCanvas(api, a.id);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
    expect(api.updateScene).not.toHaveBeenCalled();

    appJotaiStore.set(galleryOpenAtom, true);
    await switchCanvas(api, b.id);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });

  it("createNewCanvas closes the gallery", async () => {
    await createCanvas({ activate: true });
    const { api } = makeApi();
    appJotaiStore.set(galleryOpenAtom, true);
    await createNewCanvas(api);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });

  it("showGallery saves the open canvas before opening the gallery", async () => {
    const a = await createCanvas({ activate: true });
    const { api } = makeApi([rect(), rect()]);
    appJotaiStore.set(galleryOpenAtom, false);

    await showGallery(api);

    expect((await loadScene(a.id))?.elements).toHaveLength(2);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(true);
  });

  it("showGallery does nothing before the editor is ready", async () => {
    await createCanvas({ activate: true });
    const { api } = makeApi();
    setCanvasEditorReady(false);
    appJotaiStore.set(galleryOpenAtom, false);
    await showGallery(api);
    expect(appJotaiStore.get(galleryOpenAtom)).toBe(false);
  });
```

Rename `tests/CanvasList.test.tsx` → `tests/CanvasGallery.test.tsx` (`git mv`), importar `CanvasGallery` desde `../components/CanvasGallery/CanvasGallery`, y agregar:

```tsx
  it("shows an empty-state message when the search matches nothing", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search canvases"), {
      target: { value: "zzz" },
    });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No canvases match your search")).toBeTruthy();
  });

  it("renders headerActions next to the new-canvas button", () => {
    setup({ headerActions: <button type="button">extra</button> });
    expect(screen.getByText("extra")).toBeTruthy();
  });

  it("does not let key presses or paste escape to the document", () => {
    setup();
    const onDocumentKey = vi.fn();
    const onDocumentPaste = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    document.addEventListener("paste", onDocumentPaste);

    const root = screen.getByRole("dialog");
    fireEvent.keyDown(root, { key: "Delete" });
    fireEvent.paste(root);

    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(onDocumentPaste).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKey);
    document.removeEventListener("paste", onDocumentPaste);
  });
```
(en el `render` de `setup` el `CanvasGallery` debe quedar dentro de un contenedor real del DOM, que ya ocurre con `@testing-library/react`.) Los tests existentes del listado (orden por `updatedAt`, `aria-current`, filtro, selección, renombrar, doble click, menú) siguen, con `getAllByRole("listitem")` y los textos en inglés.

- [ ] **Step 2: Run them to see them fail**

Run: `yarn vitest run excalidraw-app/tests/canvasActions.test.ts excalidraw-app/tests/CanvasGallery.test.tsx --watch=false`
Expected: FAIL (`galleryOpenAtom`, `showGallery`, `CanvasGallery` no existen).

- [ ] **Step 3: Atom, actions**

`canvasAtoms.ts`:

```ts
const startsOnExternalScene = () =>
  /^#(room|json|url)=/.test(window.location.hash) ||
  new URLSearchParams(window.location.search).has("id");

/** full-screen gallery shown over the editor; hidden when opening a shared link */
export const galleryOpenAtom = atom(!startsOnExternalScene());
```

`canvasActions.ts` (importar `appJotaiStore` de `../app-jotai` y `galleryOpenAtom`):

```ts
export const switchCanvas = async (
  api: ExcalidrawImperativeAPI,
  targetId: string,
) => {
  if (!editorReady) {
    return;
  }
  if (targetId !== getActiveCanvasId()) {
    LocalData.pauseSave("canvas-switch");
    try {
      await saveCurrentCanvasNow(api, { withThumbnail: true });
      await openCanvasInEditor(api, targetId);
      await refreshCanvasState();
    } finally {
      LocalData.resumeSave("canvas-switch");
    }
  }
  appJotaiStore.set(galleryOpenAtom, false);
};

export const showGallery = async (api: ExcalidrawImperativeAPI) => {
  if (!editorReady) {
    return;
  }
  await saveCurrentCanvasNow(api, { withThumbnail: true });
  await refreshCanvasState();
  appJotaiStore.set(galleryOpenAtom, true);
};
```
(el `if (!editorReady || targetId === getActiveCanvasId()) return;` anterior se reemplaza por lo de arriba; los tests viejos de "no hace nada" siguen valiendo: sin editor listo no pasa nada, y con el mismo id no se llama a `updateScene`.)

- [ ] **Step 4: Components**

`git mv` los archivos indicados y renombrar símbolos: `CanvasList` → `CanvasGallery`, `CanvasSidebar` → `CanvasGalleryScreen`, clases CSS `canvas-sidebar` → `canvas-gallery`. Cambios de comportamiento:

`CanvasGallery.tsx`:
- La raíz es `<div className="canvas-gallery" role="dialog" aria-label={t("canvases.title")} onKeyDown={stop} onKeyUp={stop} onPaste={stop}>` con `const stop = (event: React.SyntheticEvent) => event.stopPropagation();` (el editor escucha en `document`; React ya frenó el evento nativo en la raíz). Esto mantiene el comportamiento por defecto dentro de los `<input>` (escribir, pegar).
- Cabecera: `<h1>{t("canvases.title")}</h1>`, botón `t("canvases.new")`, `{props.headerActions}`, buscador (`placeholder={t("canvases.search")}`).
- Si el filtro deja la lista vacía y hay búsqueda: `<p>{t("canvases.empty")}</p>`.
- Lista: `<ul className="canvas-gallery__grid">`; cada `<li>` es una tarjeta: miniatura grande arriba (`aspect-ratio: 4 / 3`), nombre y "hace X" abajo, botón ⋯ en la esquina. Misma lógica de renombrar (doble click y menú), `aria-current`, menú y `banners`/`footer`.

`CanvasGallery.scss` (reemplaza el layout de sidebar):

```scss
.canvas-gallery {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem clamp(1rem, 4vw, 3rem);
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--color-surface-lowest, var(--island-bg-color));
  color: var(--text-primary-color);

  &__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;

    h1 {
      flex: 1 1 100%;
      margin: 0;
      font-size: 1.5rem;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--default-border-color);
    border-radius: 0.75rem;
    background: var(--island-bg-color);
    overflow: visible;

    &[aria-current="true"] {
      outline: 2px solid var(--color-primary, #6965db);
    }
  }

  &__thumb {
    aspect-ratio: 4 / 3;
    border-radius: 0.75rem 0.75rem 0 0;
    background: var(--input-bg-color);
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__open {
    cursor: pointer;
  }

  &__meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 2.4rem 0.7rem 0.75rem;
    min-width: 0;
  }

  &__menu-button {
    position: absolute;
    right: 0.4rem;
    bottom: 0.5rem;
  }
}
```
Conservar de `CanvasSidebar.scss` los estilos de `__name`, `__time`, `__menu`, `__danger`, `__footer`, `__banner`, `__new`, `__search` (renombrando el prefijo), ajustando lo que haga falta para que se vea bien en modo claro y oscuro con las variables del tema.

`CanvasGalleryScreen.tsx` (contenedor):
- Lee `galleryOpenAtom`; si es `false`, devuelve `null`. Si `excalidrawAPI` es `null`, también.
- Mismas acciones que el contenedor anterior. `onSelect={(id) => run(() => switchCanvas(api, id))}` (ya cierra la galería), `onCreate={() => run(() => createNewCanvas(api))}`.
- `headerActions`: botón `t("canvases.importFile")` (`pickAndImportFiles`).
- `footer`: botones `t("canvases.exportAll")` e `t("canvases.importBackup")`.
- Los textos de banners y errores ya traducidos en la Task 1.

`BackToGalleryButton.tsx`:

```tsx
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { useAtomValue } from "../../app-jotai";
import { showGallery } from "../../data/canvasActions";
import { canvasIndexAtom, currentCanvasIdAtom } from "../../data/canvasAtoms";

export const BackToGalleryButton = () => {
  const api = useExcalidrawAPI();
  const { t } = useI18n();
  const index = useAtomValue(canvasIndexAtom);
  const currentId = useAtomValue(currentCanvasIdAtom);
  const name = index.canvases.find((c) => c.id === currentId)?.name;

  return (
    <button
      type="button"
      className="canvas-gallery-back"
      disabled={!api}
      onClick={() => api && showGallery(api)}
    >
      {t("canvases.back")}
      {name && <span className="canvas-gallery-back__name">{name}</span>}
    </button>
  );
};
```
con estilos en `CanvasGallery.scss` (`.canvas-gallery-back`: botón pill con borde `var(--default-border-color)`, fondo `var(--island-bg-color)`, `__name` truncado con `max-width: 12rem`).

- [ ] **Step 5: Wire `App.tsx` y `AppSidebar.tsx`**

- `AppSidebar.tsx`: borrar el import de `CanvasSidebar`, `canvasListIcon`, el `Sidebar.TabTrigger tab="canvases"` y el `Sidebar.Tab tab="canvases"` (volver al estado original de esas partes).
- `App.tsx`: montar `<CanvasGalleryScreen />` junto a los demás hijos de `<Excalidraw>` (donde estaba `<AppSidebar />` es un buen lugar) y pasar a `<Excalidraw>` la prop `renderTopLeftUI={() => <BackToGalleryButton />}`. Verificar en `packages/excalidraw/types.ts` (`renderTopLeftUI`, línea ~924) su firma; si el layout resultante tapa el menú principal en móvil, usar en su lugar un botón `position: fixed` con el mismo componente.
- Hacer `inert` el editor mientras la galería está abierta: en el wrapper del editor de `ExcalidrawWrapper` (el `div` que contiene a `<Excalidraw>`), agregar el atributo `inert` cuando `galleryOpen` (`const galleryOpen = useAtomValue(galleryOpenAtom)`); si la versión de React instalada no tipa `inert`, usar `ref` + `useEffect` con `toggleAttribute("inert", galleryOpen)`.
- Ya existentes que deben seguir funcionando: el drop de `.excalidraw` y "Abrir como canvas nuevo" usan `switchCanvas`, que cierra la galería.
- Para `#json`/`#url` en `onHashChange` la galería ya está cerrada por `createNewCanvas` → `switchCanvas`.

- [ ] **Step 6: Run tests, typecheck, lint, commit**

```bash
yarn vitest run excalidraw-app --watch=false
yarn test:typecheck && yarn fix && yarn test:code
git add excalidraw-app
git commit -m "feat(app): replace the canvas sidebar with a full-screen gallery" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Spec y verificación

**Files:**
- Modify: `docs/superpowers/specs/2026-10-08-multi-canvas-design.md`
- Modify: `docs/superpowers/plans/2026-10-08-multi-canvas-tasks.md`

- [ ] **Step 1: Spec**

Reescribir la sección "UI" (y la mención al tab del sidebar en las desviaciones) con: galería a pantalla completa siempre al abrir (salvo `#room`/`#json`/`#url`/`?id=`), tarjetas con miniatura, botón "← Canvases" en el editor que guarda con miniatura al volver, sin sidebar; textos por `t("canvases.*")` con claves en `en.json` y `es-ES.json` (excepción acotada a "no tocar `packages/`").

- [ ] **Step 2: Tasks file**

Marcar las tasks de este plan en `2026-10-08-multi-canvas-tasks.md` agregando:

```
- [x] **Galería Task 1**: traducciones (`canvases.*`)
- [x] **Galería Task 2**: galería a pantalla completa y botón para volver
- [x] **Galería Task 3**: spec actualizado
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs docs/superpowers/plans/2026-10-08-multi-canvas-tasks.md
git commit -m "docs: update multi-canvas spec for the gallery" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** galería siempre al abrir con excepciones de links, tarjetas con miniatura/nombre/tiempo/menú, "+ Nuevo", buscador, acciones, backup e importar, banners, botón de volver, textos traducidos: Tasks 1 y 2. Qué se quita: tab del sidebar.
- **Placeholders:** ninguno; los puntos a verificar (`renderTopLeftUI`, `inert`, JSON imports) dicen qué comprobar y el plan B.
- **Consistencia de tipos:** `galleryOpenAtom`, `showGallery`, `switchCanvas` definidos en la Task 2 y usados por `CanvasGalleryScreen`, `BackToGalleryButton` y los tests con los mismos nombres.
