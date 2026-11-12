"use client";
// Card 41: the shell's mount point for fill-ack toasts. Tiny and eager: it subscribes to placedAcks and mounts the toast
// chunk (apps/broker/FillAckToasts) only while a Place outlived its ticket, so the first load does not pay for it. The
// chunk is fetched as soon as any Place is noted, so it is ready by the time a ticket can hand one over.
// It loads without Suspense (retryableLazy suspense:false), like the Broker's review/ack panels.
import { useEffect, useSyncExternalStore } from "react";
import { placedAcksSnapshot, subscribePlacedAcks } from "@/apps/broker/placedAcks";
import type { FillAckVariant } from "@/apps/broker/FillAckToasts";
import { S } from "@/shell/strings";
import { asDefault, retryableLazy } from "./retryableLazy";

let chunk: Promise<typeof import("@/apps/broker/FillAckToasts")> | null = null;
const loadToasts = () => (chunk ??= import("@/apps/broker/FillAckToasts").catch((e: unknown) => { chunk = null; throw e; }));
const LazyToasts = retryableLazy(async () => asDefault((await loadToasts()).FillAckToasts), { suspense: false });
const anyNoted = () => placedAcksSnapshot().length > 0;
const anyForShell = () => placedAcksSnapshot().some((e) => e.owner === "shell");

export function FillAckHost({ variant }: { variant: FillAckVariant }) {
  const noted = useSyncExternalStore(subscribePlacedAcks, anyNoted, () => false);
  const show = useSyncExternalStore(subscribePlacedAcks, anyForShell, () => false);
  useEffect(() => { if (noted) void loadToasts().catch(() => {}); }, [noted]);
  if (!show) return null;
  return <LazyToasts variant={variant} errorMessage={S.couldntLoad} retryLabel={S.retry} errorTestId="fill-ack-chunk-error" retryTestId="fill-ack-chunk-retry" />;
}
