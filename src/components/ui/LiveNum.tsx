"use client";
// A quiet tick when a figure changes. Nothing loops; reduced motion zeroes the duration in tokens.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function LiveNum({ value, children }: { value: string | number; children: ReactNode }) {
  const prev = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 420);
    return () => window.clearTimeout(t);
  }, [value]);
  return <span className={on ? "num-tick" : undefined}>{children}</span>;
}
