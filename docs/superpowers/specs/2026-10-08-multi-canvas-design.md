# Multi-canvas para excalidraw-app — Diseño

Fecha: 2026-10-08

## Objetivo

Permitir tener varios canvas guardados dentro de `excalidraw-app`, con una lista
para crear, abrir, renombrar, duplicar y borrar, sin tener que exportar e
importar archivos a mano para cambiar de uno a otro.

Éxito: abrir la app, elegir un canvas de la lista y seguir trabajando, con todo
persistido automáticamente.

## Decisiones tomadas

- **Almacenamiento:** IndexedDB en el navegador, sin backend.
- **Interfaz:** galería a pantalla completa que se muestra siempre al abrir la
  app (ver "UI").
- **Import:** todo lo que entra (archivo, drag & drop, links `#json`/`#url`) se
  guarda como canvas nuevo y no pisa el actual.
- **Enfoque:** capa de storage multi-canvas dentro de `excalidraw-app`, sin tocar
  `packages/excalidraw` (facilita merges con upstream).
- **Library:** compartida entre todos los canvas (sigue en su store actual).
- **Colaboración en vivo (`#room`):** queda como hoy, una sesión aparte que no
  entra en la lista.

## Contexto actual del código

En `excalidraw-app/data/`:

- La escena (elementos y appState) se guarda en localStorage bajo una sola clave
  (`LocalData.ts`, `localStorage.ts`, `STORAGE_KEYS` en `app_constants.ts`).
- Las imágenes (files) y la library usan IndexedDB vía `idb-keyval`.
- `tabSync.ts` sincroniza entre pestañas.

localStorage tiene un tope de unos 5 MB, insuficiente para varios canvas con
imágenes. Por eso la escena pasa a IndexedDB.

## Modelo de datos

Una sola base IndexedDB `canvases-db` con prefijos de clave:

- `index`: `{ canvases: [{ id, name, createdAt, updatedAt }], activeCanvasId }`.
  `activeCanvasId` es solo el último canvas abierto (se usa al arrancar); cada
  pestaña mantiene su canvas activo en memoria.
- `scene:<id>`: `{ elements, appState }`. El appState se limpia igual que hoy
  (`clearAppStateForLocalStorage`).
- `thumb:<id>`: miniatura (data URL). Vive aparte para no reescribir el índice
  completo en cada autosave.
- `file:<id>:<fileId>`: archivos de imagen, aislados por canvas para poder
  borrarlos junto con él.

La library no se mueve.

### Guardado

Autosave con debounce, igual que hoy, hacia el canvas activo. Cada guardado
actualiza `updatedAt`. La miniatura se genera con menos frecuencia: al cambiar de
canvas y al cerrar.

### Migración (una sola vez)

Si no existe el índice y hay datos en localStorage:

1. Crear "Canvas 1" con esa escena y sus files.
2. Marcarlo como activo.
3. Verificar la escritura.
4. Recién entonces borrar las claves viejas.

Si algo falla, las claves viejas quedan intactas. La migración es atómica.

### Borrado

Borrar un canvas elimina su escena y sus files. Si era el último, se crea uno
vacío. Siempre con confirmación.

## UI

Al abrir la app se muestra siempre una galería a pantalla completa (overlay
sobre el editor, que sigue montado pero `inert`). Solo se salta cuando la URL
trae `#room=`, `#json=`, `#url=` o `?id=`: esos casos van directo al editor. No
hay sidebar de canvas. El "Abrir" estándar (Ctrl+O) se reemplaza por "Abrir como
canvas nuevo".

- Cabecera: título, botón "+ Nuevo canvas", "Importar archivo" y buscador por
  nombre. Si la búsqueda no encuentra nada, se muestra un mensaje.
- Grilla de tarjetas ordenada por `updatedAt` descendente. Cada tarjeta muestra
  miniatura grande, nombre y "hace X tiempo". El canvas activo va resaltado.
- Abajo: "Exportar todos" e "Importar backup", y los avisos de almacenamiento.
- Menú "⋯" por tarjeta: renombrar (también doble click), duplicar, exportar este
  canvas como `.excalidraw`, borrar (con confirmación).
- Elegir una tarjeta cierra la galería (también si es el canvas ya abierto, sin
  recargar nada). Un canvas nuevo se llama "Sin título", "Sin título 2", etc.
- En el editor, el botón "← Canvases" (`renderTopLeftUI`) guarda el canvas actual
  con su miniatura y vuelve a la galería.
- Mientras la galería está abierta ninguna tecla ni pegado llega al editor
  oculto (la galería se renderiza en un portal en `document.body` y frena
  `keydown`, `keyup` y `paste`).
- Todos los textos pasan por `t("canvases.*")`, con claves en `en.json` y
  `es-ES.json` (el resto de idiomas cae a inglés). Es la única excepción a "no
  tocar `packages/excalidraw`". Los nombres por defecto quedan guardados en el
  idioma activo al crearlos.

### Cambio de canvas

1. Cancelar el debounce pendiente y guardar de inmediato el canvas actual con su
   miniatura.
2. Cargar en paralelo escena y files del canvas destino.
3. `updateScene` con los elementos nuevos y `addFiles` con sus imágenes. Se
   resetea el historial de undo/redo para no poder deshacer hacia otro canvas.
4. Guardar `activeCanvasId` en el índice.

### Backup

- "Exportar todos": un solo `.json` con todos los canvas, sus imágenes y nombres.
- "Importar backup": agrega esos canvas a la lista sin pisar los existentes.
- Se valida formato y versión antes de escribir nada; si algo no cuadra, se
  rechaza completo.

### Varias pestañas

El índice se refresca entre pestañas con `tabSync`. Si el mismo canvas se edita
en dos pestañas, gana el último guardado (sin merge). Si el canvas abierto en una
pestaña se borra desde otra, esa pestaña conserva el contenido del editor sin
tocarlo.

## Manejo de errores

- **IndexedDB no disponible:** aviso y la app sigue con un solo canvas en
  memoria.
- **Cuota llena:** aviso claro sin perder el canvas abierto; sugiere exportar
  backup y borrar canvas viejos. Se reutiliza el patrón de
  `localStorageQuotaExceededAtom`.
- **Falla de guardado:** un reintento; si persiste, indicador "no guardado" en la
  galería y los cambios se mantienen en memoria.
- **Canvas corrupto o ilegible:** se queda en el canvas actual, muestra error y
  ofrece exportar el dato crudo en lugar de borrarlo.
- **Backup inválido:** rechazo completo antes de escribir.
- **Falla al cargar un canvas destino:** error visible y se permanece en el
  actual.

## Tests (vitest)

- `canvasStore`: crear, renombrar, duplicar, borrar; borrar el último deja uno
  vacío; files aislados por canvas.
- Migración: con datos viejos crea "Canvas 1"; sin datos no crea nada; si falla,
  no borra las claves viejas.
- Backup: export/import ida y vuelta sin pérdida; rechazo de archivos inválidos.
- Cambio de canvas: guarda el actual antes de cargar el otro; resetea historial.
- Import por archivo o link: crea canvas nuevo sin pisar el actual.
- UI de la galería: lista, resaltado del activo, menú de acciones, confirmación
  al borrar, teclas y pegado aislados del editor, traducciones completas.
- Verificación final: `yarn test:typecheck` y `yarn test:update`.

## Orden de implementación

1. `canvasStore` (IndexedDB) con tests, sin UI.
2. Migración desde localStorage.
3. Adaptar `LocalData` para guardar/cargar sobre el canvas activo.
4. Lista básica (hoy galería): nuevo, cambiar de canvas.
5. Acciones por canvas: renombrar, duplicar, borrar, exportar uno.
6. Flujo de import (archivo, drag & drop, links) como canvas nuevo.
7. Backup: exportar todos e importar backup.
8. Miniaturas, buscador, aviso de cuota y `tabSync`.

## Fuera de alcance

- Sincronización entre dispositivos.
- Colaboración en vivo guardada en la lista.
- Carpetas, etiquetas, papelera.
- Rebranding y desacople de servicios de Excalidraw (Firebase, backend de
  colaboración, Excalidraw+) para publicar como proyecto propio. Excalidraw es
  MIT: se debe conservar el aviso de copyright y la licencia, y cambiar nombre y
  logo. Queda para una etapa posterior.

## Datos a tener en cuenta

Los canvas viven solo en el navegador y la máquina donde se crearon. Borrar los
datos del sitio los elimina, y el modo incógnito no los conserva; de ahí el
backup por export.
