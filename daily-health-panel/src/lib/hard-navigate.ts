/**
 * A full page load, used after the session cookies change (login, logout,
 * signup): the panel then starts with fresh server state and no cached
 * queries from the previous account.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
