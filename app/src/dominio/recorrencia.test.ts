import { describe, expect, it } from 'vitest';
import { deRRule, descrever, ocorrenciasEntre, paraRRule, posicaoNoMes, primeiraOcorrencia, proximaData, recorrenciaPadrao, type Recorrencia } from './recorrencia';

const base = (campos: Partial<Recorrencia>): Recorrencia => ({ ...recorrenciaPadrao('diaria', '2026-09-24'), ...campos });

describe('recorrência', () => {
  it('diária: próxima data é o dia seguinte', () => {
    const r = paraRRule(base({}), '2026-09-24');
    expect(proximaData(r, '2026-09-24')).toBe('2026-09-25');
  });

  it('a cada 3 dias mantém o ritmo a partir do início', () => {
    const r = paraRRule(base({ intervalo: 3 }), '2026-09-24');
    expect(proximaData(r, '2026-09-24')).toBe('2026-09-27');
    expect(proximaData(r, '2026-09-28')).toBe('2026-09-30');
  });

  it('semanal em seg/qua/sex', () => {
    // 24/09/2026 é quinta-feira
    const r = paraRRule(base({ freq: 'semanal', dias_semana: [1, 3, 5] }), '2026-09-24');
    expect(proximaData(r, '2026-09-24')).toBe('2026-09-25'); // sexta
    expect(proximaData(r, '2026-09-25')).toBe('2026-09-28'); // segunda
  });

  it('mensal por dia do mês', () => {
    const r = paraRRule(base({ freq: 'mensal' }), '2026-01-15');
    expect(proximaData(r, '2026-01-15')).toBe('2026-02-15');
  });

  it('mensal por posição: 2ª terça', () => {
    // 08/09/2026 é a 2ª terça de setembro; a 2ª terça de outubro é 13/10
    const r = paraRRule(base({ freq: 'mensal', mensal_modo: 'posicao' }), '2026-09-08');
    expect(proximaData(r, '2026-09-08')).toBe('2026-10-13');
  });

  it('mensal na 5ª semana vira "último"', () => {
    expect(posicaoNoMes(29)).toBe(-1);
    // 29/09/2026 é a última terça de setembro; a última terça de outubro é 27/10
    const r = paraRRule(base({ freq: 'mensal', mensal_modo: 'posicao' }), '2026-09-29');
    expect(proximaData(r, '2026-09-29')).toBe('2026-10-27');
  });

  it('mensal no primeiro dia útil (segunda a sexta)', () => {
    const rec = base({ freq: 'mensal', mensal_modo: 'primeiro_util' });
    const r = paraRRule(rec, '2026-10-01'); // 01/10/2026 é quinta
    // 01/11 é domingo → 02/11 (segunda); 01/12 é terça; 01/01/2027 é sexta; 01/08/2026 seria sábado → 03/08
    expect(ocorrenciasEntre(r, '2026-10-01', '2027-01-31').map((d) => d.slice(0, 10))).toEqual(['2026-10-01', '2026-11-02', '2026-12-01', '2027-01-01']);
    expect(proximaData(paraRRule(rec, '2026-07-01'), '2026-07-01')).toBe('2026-08-03');
    expect(deRRule(r)).toEqual(rec);
    expect(descrever(rec, '2026-10-01')).toBe('Todo mês, no primeiro dia útil');
  });

  it('mensal no último dia útil', () => {
    const rec = base({ freq: 'mensal', mensal_modo: 'ultimo_util', intervalo: 1 });
    const r = paraRRule(rec, '2026-10-30T09:00');
    // 31/10 é sábado → 30/10; 30/11 é segunda; 31/12 é quinta; 31/01/2027 é domingo → 29/01
    expect(ocorrenciasEntre(r, '2026-10-01', '2027-01-31')).toEqual(['2026-10-30T09:00', '2026-11-30T09:00', '2026-12-31T09:00', '2027-01-29T09:00']);
    expect(deRRule(r)).toEqual(rec);
    expect(descrever({ ...rec, intervalo: 2 }, '2026-10-30')).toBe('A cada 2 meses, no último dia útil');
  });

  it('alinha o início ao próximo dia que a regra gera', () => {
    const primeiro = base({ freq: 'mensal', mensal_modo: 'primeiro_util' });
    expect(primeiraOcorrencia(primeiro, '2026-10-15')).toBe('2026-11-02'); // já passou do 1º útil de outubro
    expect(primeiraOcorrencia(primeiro, '2026-10-01')).toBe('2026-10-01'); // o próprio dia serve
    const ultimo = base({ freq: 'mensal', mensal_modo: 'ultimo_util' });
    expect(primeiraOcorrencia(ultimo, '2026-10-15T14:30')).toBe('2026-10-30T14:30'); // mantém a hora
  });

  it('anual', () => {
    const r = paraRRule(base({ freq: 'anual' }), '2026-03-10');
    expect(proximaData(r, '2026-03-10')).toBe('2027-03-10');
  });

  it('termina em uma data (inclusiva)', () => {
    const r = paraRRule(base({ fim: 'data', ate: '2026-09-26' }), '2026-09-24');
    expect(proximaData(r, '2026-09-25')).toBe('2026-09-26');
    expect(proximaData(r, '2026-09-26')).toBeNull();
  });

  it('termina após N ocorrências', () => {
    const r = paraRRule(base({ fim: 'contagem', contagem: 3 }), '2026-09-24');
    expect(ocorrenciasEntre(r, '2026-09-01', '2026-12-31')).toHaveLength(3);
    expect(proximaData(r, '2026-09-26')).toBeNull();
  });

  it('mantém o horário das ocorrências', () => {
    const r = paraRRule(base({}), '2026-09-24T09:30');
    expect(ocorrenciasEntre(r, '2026-09-24', '2026-09-25')).toEqual(['2026-09-24T09:30', '2026-09-25T09:30']);
  });

  it('ida e volta RRULE → formulário preserva os campos', () => {
    const original = base({ freq: 'semanal', intervalo: 2, dias_semana: [0, 2, 6], fim: 'contagem', contagem: 10 });
    const volta = deRRule(paraRRule(original, '2026-09-24'));
    expect(volta).toEqual({ ...original, dias_semana: [0, 2, 6] });

    const mensal = base({ freq: 'mensal', mensal_modo: 'posicao', fim: 'data', ate: '2027-01-31' });
    expect(deRRule(paraRRule(mensal, '2026-09-08'))).toEqual(mensal);
  });

  it('descrição em português', () => {
    expect(descrever(base({}), '2026-09-24')).toBe('Todos os dias');
    expect(descrever(base({ freq: 'semanal', dias_semana: [1, 2, 3, 4, 5] }), '2026-09-24')).toBe('Todos os dias úteis');
    expect(descrever(base({ freq: 'semanal', intervalo: 2, dias_semana: [1, 3] }), '2026-09-24')).toBe('A cada 2 semanas: seg, qua');
    expect(descrever(base({ freq: 'mensal', mensal_modo: 'posicao' }), '2026-09-08')).toBe('Todo mês, na 2ª terça');
    expect(descrever(base({ freq: 'mensal', mensal_modo: 'posicao' }), '2026-09-26')).toBe('Todo mês, no 4º sábado');
    expect(descrever(base({ freq: 'mensal', mensal_modo: 'posicao' }), '2026-09-29')).toBe('Todo mês, na última terça');
    expect(descrever(base({ freq: 'anual', fim: 'contagem', contagem: 5 }), '2026-03-10')).toBe('Todo ano, em 10 de mar, 5 vezes');
  });
});
