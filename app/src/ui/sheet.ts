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

  // Drag down anywhere along the sheet's top — handle, title, intro text, any
  // non-interactive area while scrolled to the top — to dismiss it (the sheet
  // closes even mid-task, e.g. the measure tool). Interactive controls and
  // normal body scrolling are left untouched.
  let startY = 0;
  let dy = 0;
  let dragging = false;
  let maybe = false;
  const SLOP = 6;
  const CLOSE_AT = 90;

  sheet.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
    if (sheet.scrollTop > 0) return; // scrolled down — let the body scroll
    maybe = true;
    startY = e.clientY;
    dy = 0;
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!maybe && !dragging) return;
    const delta = e.clientY - startY;
    if (!dragging) {
      if (delta > SLOP) {
        dragging = true;
        sheet.style.transition = "none";
        try {
          sheet.setPointerCapture(e.pointerId);
        } catch {
          // Non-capturable pointer (e.g. synthetic events) — drag still works.
        }
      } else if (delta < -SLOP) {
        maybe = false; // upward gesture — hand back to native scroll
        return;
      } else {
        return;
      }
    }
    dy = Math.max(0, delta);
    e.preventDefault();
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    maybe = false;
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.2s ease";
    if (dy > CLOSE_AT) {
      sheet.style.transform = "translateY(110%)";
      close();
    } else {
      sheet.style.transform = "translateY(0)";
    }
    dy = 0;
  };
  sheet.addEventListener("pointerup", endDrag);
  sheet.addEventListener("pointercancel", endDrag);

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
