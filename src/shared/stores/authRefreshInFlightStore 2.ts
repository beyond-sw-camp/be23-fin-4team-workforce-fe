let refreshInFlight = false;

export function setAuthRefreshInFlight(v: boolean) {
  refreshInFlight = v;
}

export function isAuthRefreshInFlight() {
  return refreshInFlight;
}

