import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusStepper } from './StatusStepper';

describe('StatusStepper', () => {
  it('marca o passo atual com aria-current', () => {
    render(<StatusStepper current="AGENDADA" />);
    expect(screen.getByText('AGENDADA').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('marca os passos anteriores como concluídos, e os futuros não', () => {
    render(<StatusStepper current="AGENDADA" />);
    expect(screen.getByText('CRIADA').closest('li')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('ENTREGUE').closest('li')).toHaveAttribute('data-state', 'todo');
  });

  it('lista os cinco estados', () => {
    render(<StatusStepper current="CRIADA" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
