import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, isValidCpfCnpj, maskCpfCnpj } from './br-document';

describe('isValidCpf', () => {
  it('aceita CPF válido, com e sem máscara', () => {
    expect(isValidCpf('11144477735')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('11144477736')).toBe(false);
  });

  it('rejeita sequência repetida e tamanho errado', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('1114447773')).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ válido, com e sem máscara', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
  });

  it('rejeita sequência repetida e tamanho errado', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
  });
});

describe('isValidCpfCnpj', () => {
  it('roteia por tamanho: 11 → CPF, 14 → CNPJ', () => {
    expect(isValidCpfCnpj('11144477735')).toBe(true);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
  });

  it('rejeita tamanhos fora de 11 e 14', () => {
    expect(isValidCpfCnpj('123')).toBe(false);
    expect(isValidCpfCnpj('123456789012')).toBe(false);
  });
});

describe('maskCpfCnpj', () => {
  it('mascara CPF completo (11 dígitos)', () => {
    expect(maskCpfCnpj('64877801030')).toBe('648.778.010-30');
  });

  it('mascara CNPJ completo (14 dígitos)', () => {
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('mascara progressivamente e descarta não-dígitos', () => {
    expect(maskCpfCnpj('648')).toBe('648');
    expect(maskCpfCnpj('6487')).toBe('648.7');
    expect(maskCpfCnpj('a6b4c8')).toBe('648');
  });

  it('trunca em 14 dígitos', () => {
    expect(maskCpfCnpj('112223330001810000')).toBe('11.222.333/0001-81');
  });
});
