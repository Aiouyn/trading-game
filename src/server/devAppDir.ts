// Next chooses `./app` over `./src/app`. `./app` is the Port Avalon launcher, not the site.
// Hide that one directory from existsSync so `next dev` and `next build` use `src/app`.
import fs from "node:fs";
import path from "node:path";

let patched = false;

export function preferSrcApp(root: string): void {
  if (patched) return;
  patched = true;
  const launcher = path.resolve(root, "app");
  const real = fs.existsSync;
  const wrapped = ((target: fs.PathLike) => {
    if (typeof target === "string" && path.resolve(target) === launcher) return false;
    return real.call(fs, target);
  }) as typeof fs.existsSync;
  fs.existsSync = wrapped;
}
