import { create } from 'zustand';

type SessionUiStore = {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
};

export const useSessionUiStore = create<SessionUiStore>((set) => ({
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
