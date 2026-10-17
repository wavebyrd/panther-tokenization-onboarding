"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, tracked as it resizes. Zero until it has
 * been measured, so a chart draws once at its real size instead of drawing at
 * a guess and jumping.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
