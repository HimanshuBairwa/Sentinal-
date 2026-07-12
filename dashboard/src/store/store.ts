import { create } from 'zustand';

interface DashboardState {
  isConnected: boolean;
  activeUsers: number;
  fraudAlerts: number;
  transactions: { time: string; amount: number }[];
  setConnected: (status: boolean) => void;
  updateMetrics: (data: Partial<DashboardState>) => void;
  addTransaction: (tx: { time: string; amount: number }) => void;
}

export const useStore = create<DashboardState>((set) => ({
  isConnected: false,
  activeUsers: 1423,
  fraudAlerts: 12,
  transactions: Array.from({ length: 20 }, (_, i) => ({
    time: `${new Date().getHours()}:${String(new Date().getMinutes() - 20 + i).padStart(2, '0')}`,
    amount: Math.floor(Math.random() * 1000) + 100
  })),
  setConnected: (status) => set({ isConnected: status }),
  updateMetrics: (data) => set((state) => ({ ...state, ...data })),
  addTransaction: (tx) =>
    set((state) => ({
      transactions: [...state.transactions.slice(-19), tx]
    }))
}));
