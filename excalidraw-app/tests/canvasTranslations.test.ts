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
      return entry.name === "tests" || entry.name === "node_modules"
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

describe("canvases translations", () => {
  const enKeys = collectKeys((en as any).canvases, "canvases.");
  const esKeys = collectKeys((es as any).canvases, "canvases.");

  it("es-ES has exactly the same canvases.* keys as en", () => {
    expect([...esKeys].sort()).toEqual([...enKeys].sort());
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
