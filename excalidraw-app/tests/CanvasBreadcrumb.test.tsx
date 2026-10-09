import { fireEvent, render, screen } from "@testing-library/react";
import { EditorJotaiProvider } from "@excalidraw/excalidraw/editor-jotai";

import { CanvasBreadcrumbView } from "../components/CanvasGallery/CanvasBreadcrumb";

const setup = (
  overrides: Partial<React.ComponentProps<typeof CanvasBreadcrumbView>> = {},
) => {
  const handlers = { onHome: vi.fn(), onRename: vi.fn() };
  render(
    <EditorJotaiProvider>
      <CanvasBreadcrumbView
        name="Canvas 2"
        isMobile={false}
        {...handlers}
        {...overrides}
      />
    </EditorJotaiProvider>,
  );
  return handlers;
};

describe("CanvasBreadcrumbView", () => {
  it("goes to the gallery from the home segment, not from the name", () => {
    const h = setup();
    fireEvent.click(screen.getByText("Canvas 2"));
    expect(h.onHome).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "All canvases" }));
    expect(h.onHome).toHaveBeenCalled();
  });

  it("renames inline: click the name, type, Enter (trimmed)", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename canvas" }));
    const input = screen.getByDisplayValue("Canvas 2");
    fireEvent.change(input, { target: { value: "  Plano  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("Plano");
    expect(screen.queryByDisplayValue("Plano")).toBeNull();
  });

  it("commits on blur and ignores empty or unchanged names", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename canvas" }));
    fireEvent.blur(screen.getByDisplayValue("Canvas 2"));
    fireEvent.click(screen.getByRole("button", { name: "Rename canvas" }));
    const input = screen.getByDisplayValue("Canvas 2");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Canvas 2")).toBeTruthy();
  });

  it("cancels with Escape", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename canvas" }));
    const input = screen.getByDisplayValue("Canvas 2");
    fireEvent.change(input, { target: { value: "otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Canvas 2")).toBeTruthy();
  });

  it("does not let typing in the name reach the editor's shortcuts", () => {
    setup();
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    fireEvent.click(screen.getByRole("button", { name: "Rename canvas" }));
    fireEvent.keyDown(screen.getByDisplayValue("Canvas 2"), { key: "r" });
    expect(onDocumentKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKey);
  });

  it("shows only the icon for the home segment on mobile", () => {
    setup({ isMobile: true });
    expect(screen.queryByText("Canvases")).toBeNull();
    expect(screen.getByRole("button", { name: "All canvases" })).toBeTruthy();
  });

  it("shows the home label on desktop", () => {
    setup();
    expect(screen.getByText("Canvases")).toBeTruthy();
  });
});
