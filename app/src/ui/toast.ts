// Tiny transient toast for non-fatal messages (e.g. "pack not downloaded yet").

export function toast(message: string, ms = 3200): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.getElementById("ui-root")!.append(el);
  // force reflow so the enter transition runs
  void el.offsetWidth;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, ms);
}
