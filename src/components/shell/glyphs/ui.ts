// Shell UI glyphs (24 px grid) and the 16 px window-control set. `app` is the neutral fallback frame.
export const quay = ["M3 9h18M7 9v7M17 9v7", "M3 19.5h3.5M10.25 19.5h3.5M17.5 19.5H21"] as const;
export const bell = ["M6.5 16v-4.5a5.5 5.5 0 0 1 11 0V16l1.5 2h-14z", "M10 20.5h4"] as const;
export const search = ["M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5"] as const;
export const focus = ["M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"] as const;
export const layout = ["M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5zM14 5v14M14 12h6.5"] as const;
export const chevLeft = ["m15 6-6 6 6 6"] as const;
/** External link (17B SET-08, Studio ruling): up-right arrow, drawn after the label. */
export const external = ["M8 16 16 8", "M9.5 8H16v6.5"] as const;
export const app = ["M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5z", "M9 12h6"] as const;

/** P0 alert (Studio-approved): warning triangle with a vertical bar and dot, same 24 grid / stroke as the set. */
export const alert = ["M10.7 5.25a1.5 1.5 0 0 1 2.6 0l7.1 12.5a1.5 1.5 0 0 1-1.3 2.25H4.9a1.5 1.5 0 0 1-1.3-2.25z", "M12 10v4", "M12 17h.01"] as const;
/** World event (Studio-approved): 4-point compass rose, drawn in --steel. Replaces the '●' marker. */
export const world = ["M12 3.5l2.1 6.4 6.4 2.1-6.4 2.1-2.1 6.4-2.1-6.4-6.4-2.1 6.4-2.1z"] as const;
/** Error (Studio-approved): circle with an exclamation mark, drawn in --signal (never --loss, which is P0's). */
export const error = ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z", "M12 7.75v5", "M12 16.25h.01"] as const;
export const UI_GLYPHS = { quay, bell, alert, world, error, search, focus, layout, chevLeft, external, app };

// 16 px window controls.
export const collapse = "M4.5 12h7";
export const fill = "M6.5 4H4v8h2.5M9.5 4H12v8H9.5";
export const close = "m4.5 4.5 7 7M11.5 4.5l-7 7";
export const SMALL_GLYPHS = { collapse, fill, close };
