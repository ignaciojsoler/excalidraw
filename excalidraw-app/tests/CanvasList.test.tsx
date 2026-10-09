import { fireEvent, render, screen } from "@testing-library/react";
import { EditorJotaiProvider } from "@excalidraw/excalidraw/editor-jotai";

import { CanvasList } from "../components/CanvasSidebar/CanvasList";
import { formatRelativeTime } from "../components/CanvasSidebar/formatRelativeTime";

const NOW = 1_700_000_000_000;

const canvases = [
  { id: "a", name: "Viejo", createdAt: 1, updatedAt: NOW - 3 * 3600 * 1000 },
  { id: "b", name: "Reciente", createdAt: 2, updatedAt: NOW - 30 * 1000 },
  { id: "c", name: "Medio", createdAt: 3, updatedAt: NOW - 5 * 60 * 1000 },
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof CanvasList>> = {},
) => {
  const handlers = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
  };
  render(
    <EditorJotaiProvider>
      <CanvasList
        canvases={canvases}
        currentId="c"
        thumbnails={new Map()}
        {...handlers}
        {...overrides}
      />
    </EditorJotaiProvider>,
  );
  return handlers;
};

describe("formatRelativeTime", () => {
  it("formats in Spanish", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(formatRelativeTime(NOW - 3 * 3600_000, NOW)).toBe("3 h ago");
    expect(formatRelativeTime(NOW - 2 * 86400_000, NOW)).toBe("2 d ago");
  });
});

describe("CanvasList", () => {
  it("lists canvases most recently updated first", () => {
    setup();
    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names[0]).toContain("Reciente");
    expect(names[1]).toContain("Medio");
    expect(names[2]).toContain("Viejo");
  });

  it("marks the current canvas", () => {
    setup();
    const current = screen.getByText("Medio").closest("li")!;
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByText("Viejo").closest("li")!.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("filters by name", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search canvases"), {
      target: { value: "vie" },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Viejo")).toBeTruthy();
  });

  it("selects a canvas on click and creates a new one with the button", () => {
    const h = setup();
    fireEvent.click(screen.getByText("Viejo"));
    expect(h.onSelect).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByText("+ New canvas"));
    expect(h.onCreate).toHaveBeenCalled();
  });

  it("renames from the menu, trimming the name", () => {
    const h = setup();
    fireEvent.click(screen.getByLabelText("Actions for Viejo"));
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Viejo");
    fireEvent.change(input, { target: { value: "  Nuevo nombre  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("a", "Nuevo nombre");
  });

  it("renames on double click and cancels with Escape", () => {
    const h = setup();
    fireEvent.doubleClick(screen.getByText("Viejo"));
    const input = screen.getByDisplayValue("Viejo");
    fireEvent.change(input, { target: { value: "otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Viejo")).toBeTruthy();
  });

  it("duplicates, exports and deletes from the menu", () => {
    const h = setup();
    fireEvent.click(screen.getByLabelText("Actions for Viejo"));
    fireEvent.click(screen.getByText("Duplicate"));
    expect(h.onDuplicate).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByLabelText("Actions for Viejo"));
    fireEvent.click(screen.getByText("Export this canvas"));
    expect(h.onExport).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByLabelText("Actions for Viejo"));
    fireEvent.click(screen.getByText("Delete"));
    expect(h.onDelete).toHaveBeenCalledWith("a");
  });

  it("renders banners and footer slots", () => {
    setup({
      banners: <div>sin espacio</div>,
      footer: <button type="button">Export all</button>,
    });
    expect(screen.getByText("sin espacio")).toBeTruthy();
    expect(screen.getByText("Export all")).toBeTruthy();
  });
});
