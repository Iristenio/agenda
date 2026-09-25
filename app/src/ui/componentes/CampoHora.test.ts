import { describe, expect, it } from 'vitest';
import { interpretarHora } from './CampoHora';

describe('horário digitado', () => {
  it('aceita formatos comuns', () => {
    expect(interpretarHora('1430')).toBe('14:30');
    expect(interpretarHora('930')).toBe('09:30');
    expect(interpretarHora('9')).toBe('09:00');
    expect(interpretarHora('14:5')).toBe('14:05');
    expect(interpretarHora('14:30')).toBe('14:30');
    expect(interpretarHora('0715')).toBe('07:15');
  });
  it('recusa horários impossíveis', () => {
    expect(interpretarHora('2500')).toBeNull();
    expect(interpretarHora('1260')).toBeNull();
    expect(interpretarHora('')).toBeNull();
    expect(interpretarHora('ab')).toBeNull();
  });
});
