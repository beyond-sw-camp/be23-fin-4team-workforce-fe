import { create } from 'zustand';

type FilterPanelStore = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
};

export const useFilterPanelStore = create<FilterPanelStore>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
}));
