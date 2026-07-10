import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { applyTheme, resolveInitialTheme, type Theme } from '@/lib/theme';

/**
 * Aplica o tema também no mount (além do pré-paint em main.tsx) para manter
 * classe e estado do componente sempre em sincronia, sem depender de quem
 * montou primeiro.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle(): void {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={toggle}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
