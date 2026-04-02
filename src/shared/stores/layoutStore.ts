import { create } from 'zustand';

type LayoutStore = {
  siderCollapsed: boolean;
  toggleSider: () => void;
};

export const useLayoutStore = create<LayoutStore>((set) => ({
  siderCollapsed: false,
  toggleSider: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
}));
