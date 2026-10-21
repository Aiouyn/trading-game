"use client";
// Button (17A T1 §2; 17 §3.1.1, §3.3.3, §3.16). Disabled uses aria-disabled so the button stays focusable;
// activation is ignored while disabled.
import { useEffect, useRef, type ButtonHTMLAttributes, type MouseEvent } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
}

/** One primary per view (17 §3.1.1): the nearest window or phone app view, else the page. */
const VIEW = ".win, .phone-appview";

export function countPrimaries(el: Element): number {
  const scope = el.closest(VIEW) ?? el.ownerDocument.body;
  return scope.querySelectorAll(".btn-primary").length;
}

export function Button({ variant = "secondary", size = "md", disabled = false, type = "button", className, onClick, ...rest }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || variant !== "primary" || !ref.current) return;
    if (countPrimaries(ref.current) > 1) console.warn("Quay: more than one primary Button in one view (17 §3.1.1)");
  }, [variant]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) { e.preventDefault(); return; }
    onClick?.(e);
  };

  const cls = ["btn", `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(" ");
  return <button {...rest} ref={ref} type={type} className={cls} aria-disabled={disabled || undefined} onClick={handleClick} />;
}
