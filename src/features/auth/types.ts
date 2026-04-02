export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

export type AuthFlags = {
  mustChangePassword?: boolean;
  emailVerificationRequired?: boolean;
  accountStatus?: AccountStatus;
};

export type Me = {
  id: string;
  name: string;
  email: string;
  permissions: string[];
  flags?: AuthFlags;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthSession = {
  user: Me;
};

export type AuthClient = {
  login: (input: LoginInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  getSession: () => Promise<AuthSession | null>;
  getMe: () => Promise<Me>;
  refreshSession?: () => Promise<AuthSession | null>;
};

export type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: Me | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};
