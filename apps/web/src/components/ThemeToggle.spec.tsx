import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

function mockMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('começa refletindo o tema claro resolvido e oferece ativar o escuro', () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Ativar tema escuro' })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('começa refletindo o tema escuro resolvido e oferece ativar o claro', () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clicar alterna a classe dark e persiste em localStorage', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('ovgs.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ativar tema claro' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('ovgs.theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Ativar tema escuro' })).toBeInTheDocument();
  });
});
