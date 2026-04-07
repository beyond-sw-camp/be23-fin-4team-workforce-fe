const ACCESS_TOKEN_STORAGE_KEY = 'workforce.accessToken';

let accessToken: string | null = null;

type AccessTokenListener = (token: string | null) => void;
const accessTokenListeners = new Set<AccessTokenListener>();

export function subscribeAccessToken(listener: AccessTokenListener) {
  accessTokenListeners.add(listener);
  listener(getAccessToken());
  return () => {
    accessTokenListeners.delete(listener);
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAccessTokenFromStorage() {
  if (!canUseStorage()) {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

if (!accessToken) {
  accessToken = readAccessTokenFromStorage();
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;

  if (canUseStorage()) {
    if (!token) {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    }
  }

  accessTokenListeners.forEach((fn) => {
    fn(token);
  });
}

export function clearAccessToken() {
  setAccessToken(null);
}
