// 17B Wire (UI card 1 · WIR-A): the news feed on the existing mock `news` channel.
"use client";
import { useChannel } from "@/shell/contracts/useChannel";
import { Feed } from "./Feed";
import { useWireStrings } from "./strings";
import "./wire.css";

export default function WireApp() {
  const view = useChannel("news");
  const t = useWireStrings();
  return <Feed view={view} t={t} />;
}
