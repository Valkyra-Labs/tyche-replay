// Draws the book ladder on a canvas: asks above, bids below, best prices
// meeting in the middle, a size bar per level. Colour is never alone: the
// side is also given by position and by the sign column.

export type Palette = {
  text: string;
  muted: string;
  bid: string;
  ask: string;
  bidWash: string;
  askWash: string;
  border: string;
  surface: string;
  rowHeight: number;
  font: string;
};

export function readPalette(el: Element): Palette {
  const s = getComputedStyle(el);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    text: v("--stoa-color-text"),
    muted: v("--stoa-color-text-muted"),
    bid: v("--stoa-color-bid"),
    ask: v("--stoa-color-ask"),
    bidWash: v("--stoa-color-up-wash"),
    askWash: v("--stoa-color-down-wash"),
    border: v("--stoa-color-border"),
    surface: v("--stoa-color-surface"),
    rowHeight: parseFloat(v("--stoa-density-row-height")) || 22,
    font: `${v("--stoa-density-font-size") || "12px"} "IBM Plex Mono", ui-monospace, monospace`,
  };
}

export function drawLadder(
  canvas: HTMLCanvasElement,
  levels: Float64Array | null,
  depth: number,
  p: Palette,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = p.rowHeight * depth * 2;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = p.surface;
  ctx.fillRect(0, 0, width, height);
  if (!levels) return;
  const nb = levels[0] ?? 0;
  const na = levels[1] ?? 0;
  let maxSize = 1;
  for (let i = 0; i < nb + na; i++) maxSize = Math.max(maxSize, levels[2 + i * 2 + 1] ?? 0);
  ctx.font = p.font;
  ctx.textBaseline = "middle";
  const priceX = width * 0.45;
  const sizeX = width - 8;
  const row = (y: number, price: number, size: number, bid: boolean) => {
    const w = (size / maxSize) * (width * 0.5);
    ctx.fillStyle = bid ? p.bidWash : p.askWash;
    ctx.fillRect(width - w, y + 1, w, p.rowHeight - 2);
    ctx.fillStyle = bid ? p.bid : p.ask;
    ctx.textAlign = "left";
    ctx.fillText(bid ? "B" : "A", 8, y + p.rowHeight / 2);
    ctx.textAlign = "right";
    ctx.fillText(price.toFixed(2), priceX, y + p.rowHeight / 2);
    ctx.fillStyle = p.text;
    ctx.fillText(size.toLocaleString("en-US"), sizeX, y + p.rowHeight / 2);
  };
  // Asks: best at the bottom of the upper half.
  for (let i = 0; i < na; i++) {
    const at = 2 + (nb + i) * 2;
    row((depth - 1 - i) * p.rowHeight, levels[at]!, levels[at + 1]!, false);
  }
  for (let i = 0; i < nb; i++) {
    const at = 2 + i * 2;
    row((depth + i) * p.rowHeight, levels[at]!, levels[at + 1]!, true);
  }
  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(0, depth * p.rowHeight + 0.5);
  ctx.lineTo(width, depth * p.rowHeight + 0.5);
  ctx.stroke();
}
