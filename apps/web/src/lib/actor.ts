const KEY = 'ovgs.actor';

export function getActor(): string {
  return localStorage.getItem(KEY) ?? 'Operador';
}

export function setActor(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, trimmed);
}
