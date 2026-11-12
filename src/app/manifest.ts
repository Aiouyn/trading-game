import type { MetadataRoute } from "next";
import { MANIFEST } from "@/pwa/manifest";

export default function manifest(): MetadataRoute.Manifest {
  return MANIFEST;
}
