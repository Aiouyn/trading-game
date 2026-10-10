import { Game } from '@/components/Game';

/**
 * One page hosts the whole shell (P2-110). The path is read on the client by parseRoute, so every
 * path renders the same shell and an unknown path lands on the desktop with a toast (DECISIONS "Routing").
 */
export default function Page() {
  return <Game />;
}
