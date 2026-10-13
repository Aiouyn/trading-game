// The viewer's price alerts (spec 1.3, "Set alert at X" from the chart menu). They live in this session only: nothing reaches
// the engine or another player, and an alert that fires is a toast (ChartCard). The rule itself is chartLevels.ts.
import { create } from 'zustand';
import type { Alert } from './chartLevels';

interface AlertState {
  alerts: Alert[];
  /** sets an alert and returns its id */
  add: (a: Omit<Alert, 'id'>) => string;
  remove: (id: string) => void;
}

let seq = 0;

export const useAlerts = create<AlertState>((set, get) => ({
  alerts: [],
  add(a) {
    seq += 1;
    const id = `al${seq}`;
    set({ alerts: [...get().alerts, { ...a, id }] });
    return id;
  },
  remove(id) {
    set({ alerts: get().alerts.filter((x) => x.id !== id) });
  },
}));
