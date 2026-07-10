import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getStoredTheme, resolveInitialTheme } from './theme';

const KEY = 'ovgs.theme';

function mockMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  describe('getStoredTheme', () => {
    it('retorna null quando nada foi guardado', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('retorna o valor guardado quando válido', () => {
      applyTheme('dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('retorna null para um valor inválido guardado', () => {
      localStorage.setItem(KEY, 'sepia');
      expect(getStoredTheme()).toBeNull();
    });
  });

  describe('resolveInitialTheme', () => {
    it('prioriza o valor guardado sobre matchMedia', () => {
      mockMatchMedia(false);
      applyTheme('dark');
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('cai em matchMedia quando não há valor guardado (escuro)', () => {
      mockMatchMedia(true);
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('cai em matchMedia quando não há valor guardado (claro)', () => {
      mockMatchMedia(false);
      expect(resolveInitialTheme()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('liga a classe dark e persiste "dark"', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('ovgs.theme')).toBe('dark');
    });

    it('desliga a classe dark e persiste "light"', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('ovgs.theme')).toBe('light');
    });
  });
});
