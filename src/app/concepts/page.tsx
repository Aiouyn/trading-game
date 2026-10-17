import type { Metadata } from 'next';
import { Game } from '@/components/Game';

export const metadata: Metadata = {
  title: 'Port Avalon — Three ways to feel richer',
  description: 'Three interactive visual proposals for the trading game, on desktop and phone.',
};

export default function ConceptsPage() {
  return <Game />;
}
