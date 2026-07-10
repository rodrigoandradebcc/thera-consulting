import { beforeEach, describe, expect, it } from 'vitest';
import { getActor, setActor } from './actor';

describe('actor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retorna "web" como padrão quando nenhum ator foi definido', () => {
    expect(getActor()).toBe('web');
  });

  it('retoma o valor definido por setActor', () => {
    setActor('rodrigo');

    expect(getActor()).toBe('rodrigo');
  });

  it('setActor com string vazia limpa o valor armazenado e volta ao padrão', () => {
    setActor('rodrigo');
    setActor('');

    expect(getActor()).toBe('web');
  });

  it('setActor com apenas espaços limpa o valor armazenado e volta ao padrão', () => {
    setActor('rodrigo');
    setActor('   ');

    expect(getActor()).toBe('web');
  });
});
