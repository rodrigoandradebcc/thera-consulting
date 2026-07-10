import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SALES_ORDER_STATUSES } from '@/domain/status-machine';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renderiza rótulo textual para todos os status, não só cor', () => {
    for (const status of SALES_ORDER_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(status.replace('_', ' '))).toBeInTheDocument();
      unmount();
    }
  });

  it('marca o ícone como decorativo para leitores de tela', () => {
    const { container } = render(<StatusBadge status="EM_TRANSPORTE" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
