// The row height of the density in effect, for views that Stoa does not
// size in rows itself (the heatmap beside the ladder).
import { useLayoutEffect, useState, type RefObject } from "react";
import { readCanvasTokens, useTokenSignal } from "@valkyra-labs/stoa-react";

/** Row height in CSS pixels at `el`, read as Stoa's Ladder reads it, and
 * read again whenever the density or the theme changes. */
export function useRowHeight(el: RefObject<Element | null>): number {
  const [rowHeight, setRowHeight] = useState(0);
  const read = () => {
    if (el.current) setRowHeight(readCanvasTokens(el.current).rowHeight);
  };
  useLayoutEffect(read, []);
  useTokenSignal(el, undefined, read);
  return rowHeight;
}
