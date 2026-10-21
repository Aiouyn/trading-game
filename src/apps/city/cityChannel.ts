// `city:{cityId}` channel client injected into the City renderer (Spec 2 §2). Stub until the gateway (19).
import type { CityChannelClient } from "@/city";

export const stubCityChannel: CityChannelClient = {
  subscribe: () => () => {},
  stateVersion: () => null,
};

/** HTTP-cache chunk fetch injected into the renderer [P]. */
export async function fetchChunk(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`chunk ${url}: ${r.status}`);
  return r.arrayBuffer();
}
