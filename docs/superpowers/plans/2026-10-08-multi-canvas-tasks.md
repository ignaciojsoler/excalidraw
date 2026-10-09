# Multi-canvas: tasks

Plan: `docs/superpowers/plans/2026-10-08-multi-canvas.md`
Spec: `docs/superpowers/specs/2026-10-08-multi-canvas-design.md`

Cada task termina con `yarn test:typecheck`, `yarn fix`, sus tests y un commit.

- [x] **Task 1**: `canvasStore` (IndexedDB): crear, renombrar, duplicar, borrar, escenas, miniaturas, files por canvas, índice serializado
- [x] **Task 2**: migración desde localStorage a "Canvas 1" y `bootstrapCanvases()`
- [x] **Task 3**: backup (formato, validación, exportar/importar)
- [x] **Task 4**: `LocalData` y `App.tsx` guardan/cargan sobre el canvas activo (files aislados, `clearObsoleteFiles` acotado)
- [x] **Task 5**: acciones de canvas (cambiar, crear, duplicar, borrar, renombrar) con guardado previo y reset de historial
- [x] **Task 6**: sidebar de canvas (tab en el sidebar por defecto), lista, buscador, menú ⋯
- [x] **Task 7**: importar archivos, drag & drop y links `#json`/`#url` como canvas nuevo
- [ ] **Task 8**: botones de backup en el sidebar y avisos (sin almacenamiento, cuota llena, no guardado)
- [ ] **Task 9**: actualizar el spec con las desviaciones
- [ ] **Verificación final**: `yarn test:typecheck`, `yarn test:update`, `yarn test:code`, revisión de la rama completa
