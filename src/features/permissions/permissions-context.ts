import { createContext } from 'react';
import type { PermissionsContextValue } from '@/features/permissions/model';

export const PermissionsContext = createContext<PermissionsContextValue | null>(null);
