// Minimal bottom-sheet / modal helper. No framework — the app is small enough
// that direct DOM keeps the bundle tiny and offline-friendly.

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  setTitle(t: string): void;
  close(): void;
}

const root = () => document.getElementById("ui-root")!;

export function openSheet(title: string, onClose?: () => void): Sheet {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");

  const handle = document.createElement("div");
  handle.className = "sheet-handle";

  const h = document.createElement("h2");
  h.textContent = title;

  const body = document.createElement("div");

  sheet.append(handle, h, body);
  root().append(backdrop, sheet);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sheet.classList.add("hidden");
    backdrop.remove();
    setTimeout(() => sheet.remove(), 200);
    onClose?.();
  };
  backdrop.addEventListener("click", close);

  // Swipe the grab handle down to dismiss (the sheet closes even mid-task, e.g.
  // the measure tool, without needing to complete it).
  let startY = 0;
  let dy = 0;
  let dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    dy = 0;
    sheet.style.transition = "none";
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Non-capturable pointer (e.g. synthetic events) — drag still works.
    }
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.2s ease";
    if (dy > 90) {
      sheet.style.transform = "translateY(110%)";
      close();
    } else {
      sheet.style.transform = "translateY(0)";
    }
    dy = 0;
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  return {
    el: sheet,
    body,
    setTitle: (t) => (h.textContent = t),
    close,
  };
}

export function kvGrid(entries: [string, string][]): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "kv";
  for (const [k, v] of entries) {
    const kEl = document.createElement("div");
    kEl.className = "k";
    kEl.textContent = k;
    const vEl = document.createElement("div");
    vEl.className = "v";
    vEl.textContent = v;
    grid.append(kEl, vEl);
  }
  return grid;
}

export function button(label: string, opts: { primary?: boolean } = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn" + (opts.primary ? " primary" : "");
  b.textContent = label;
  return b;
}
