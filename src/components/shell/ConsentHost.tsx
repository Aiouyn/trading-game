"use client";
// Loaded only after the first user interaction (see ConsentBoot in QuayShell), so a guest
// /broker first-load does not request this chunk or the prompt's copy.
import { useState } from "react";
import { needsTelemetryConsentPrompt } from "@/shell/telemetryConsent";
import { ConsentPrompt } from "./ConsentPrompt";

export function ConsentHost() {
  const [open, setOpen] = useState(() => needsTelemetryConsentPrompt());
  if (!open) return null;
  return <ConsentPrompt onDone={() => setOpen(false)} />;
}
