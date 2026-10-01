import { describe, expect, it } from 'vitest';
import type { Externo, Feriado } from './tipos';
import { contarDiasUteis, diaUtilDoMes, ehDiaUtil, montarFeriados, normalizarNome, validarFeriado } from './feriados';
import { concluirTarefa, novaTarefa, proximoPrazo } from './tarefas';
import { paraRRule, recorrenciaPadrao } from './recorrencia';

let seq = 0;
const feriado = (campos: Partial<Feriado>): Feriado => ({
  id: `f${++seq}`, nome: 'Feriado', data: null, anual: false, tipo: 'folga', status: 'ativo', criado_em: 'x', atualizado_em: 'x', ...campos,
});
const doGoogle = (titulo: string, data: string, campos: Partial<Externo> = {}): Externo => ({
  id: `feriados|${titulo}${data}`, agenda_id: 'feriados', titulo, local: '', inicio: `${data}T00:00`, fim: `${data}T23:59`, dia_inteiro: true, link: '', livre: true, ...campos,
});
const AGENDAS = new Set(['feriados']);

describe('mapa de feriados (RN42, RN43)', () => {
  it('une os do Google com os cadastrados', () => {
    const mapa = montarFeriados(
      [feriado({ nome: 'Aniversário da UNILAB', data: '2026-11-18' })],
      [doGoogle('Finados', '2026-11-02'), doGoogle('Proclamação da República', '2026-11-15')],
      AGENDAS, '2026-11-01', '2026-11-30',
    );
    expect([...mapa.entries()].sort()).toEqual([
      ['2026-11-02', 'Finados'],
      ['2026-11-15', 'Proclamação da República'],
      ['2026-11-18', 'Aniversário da UNILAB'],
    ]);
  });

  it('"não é folga" tira o feriado do Google pelo nome, todo ano, ignorando acentos e maiúsculas', () => {
    expect(normalizarNome('  Dia das MÃES ')).toBe('dia das maes');
    const mapa = montarFeriados(
      [feriado({ nome: 'dia das maes', tipo: 'nao_folga' })],
      [doGoogle('Dia das Mães', '2026-05-10'), doGoogle('Dia das Mães', '2027-05-09'), doGoogle('Tiradentes', '2027-04-21')],
      AGENDAS, '2026-01-01', '2027-12-31',
    );
    expect([...mapa.values()]).toEqual(['Tiradentes']);
  });

  it('só conta agenda marcada, e só eventos de dia inteiro', () => {
    const mapa = montarFeriados(
      [],
      [doGoogle('Reunião', '2026-11-03', { agenda_id: 'trabalho' }), doGoogle('Live', '2026-11-04', { dia_inteiro: false })],
      AGENDAS, '2026-11-01', '2026-11-30',
    );
    expect(mapa.size).toBe(0);
  });

  it('feriado anual cadastrado vale em todos os anos; excluído não vale', () => {
    const lista = [feriado({ nome: 'Padroeira da cidade', data: '2020-08-15', anual: true }), feriado({ nome: 'x', data: '2026-08-20', status: 'excluido' })];
    const mapa = montarFeriados(lista, [], AGENDAS, '2026-01-01', '2027-12-31');
    expect([...mapa.keys()].sort()).toEqual(['2026-08-15', '2027-08-15']);
  });

  it('validação', () => {
    expect(validarFeriado({ nome: ' ', data: '2026-01-01', tipo: 'folga' })).toHaveLength(1);
    expect(validarFeriado({ nome: 'a', data: null, tipo: 'folga' })).toHaveLength(1);
    expect(validarFeriado({ nome: 'a', data: null, tipo: 'nao_folga' })).toHaveLength(0);
  });
});

describe('dias úteis com feriados (RN44, RN45)', () => {
  const finados = new Map([['2026-11-02', 'Finados']]);

  it('feriado não é dia útil', () => {
    expect(ehDiaUtil('2026-11-02', finados)).toBe(false);
    expect(ehDiaUtil('2026-11-03', finados)).toBe(true);
    expect(ehDiaUtil('2026-11-01', finados)).toBe(false); // domingo
  });

  it('primeiro dia útil pula fim de semana E feriado', () => {
    // 01/11/2026 é domingo, 02/11 é feriado → 03/11
    expect(diaUtilDoMes('2026-11-15', 'primeiro_util', finados)).toBe('2026-11-03');
    expect(diaUtilDoMes('2026-11-15', 'primeiro_util')).toBe('2026-11-02');
  });

  it('último dia útil recua antes do feriado', () => {
    const vespera = new Map([['2026-12-31', 'Recesso'], ['2026-12-30', 'Recesso']]);
    expect(diaUtilDoMes('2026-12-10', 'ultimo_util', vespera)).toBe('2026-12-29');
  });

  it('contagem de dias úteis das férias desconta feriados', () => {
    // 02/11 (seg) a 06/11 (sex): 5 dias de semana, 1 feriado
    expect(contarDiasUteis('2026-11-02', '2026-11-06')).toBe(5);
    expect(contarDiasUteis('2026-11-02', '2026-11-06', finados)).toBe(4);
  });
});

describe('tarefa recorrente em dia útil pula feriado (RN44)', () => {
  const novoId = () => `n${++seq}`;

  it('primeiro dia útil: a próxima vai para o dia seguinte ao feriado', () => {
    const rrule = paraRRule({ ...recorrenciaPadrao('mensal', '2026-10-01'), mensal_modo: 'primeiro_util' }, '2026-10-01');
    const finados = new Map([['2026-11-02', 'Finados']]);
    expect(proximoPrazo(rrule, '2026-10-01', finados)).toBe('2026-11-03');
    expect(proximoPrazo(rrule, '2026-11-03', finados)).toBe('2026-12-01');
    const { proxima } = concluirTarefa(novaTarefa({ id: 't', lista_id: 'geral', titulo: 'x', prazo: '2026-10-01', rrule }), novoId, new Date(), finados);
    expect(proxima?.prazo).toBe('2026-11-03');
  });

  it('último dia útil recuado por feriado não repete o mesmo mês', () => {
    const rrule = paraRRule({ ...recorrenciaPadrao('mensal', '2026-11-30'), mensal_modo: 'ultimo_util' }, '2026-11-30');
    const recesso = new Map([['2026-12-31', 'Recesso']]);
    expect(proximoPrazo(rrule, '2026-11-30', recesso)).toBe('2026-12-30'); // 31/12 é feriado
    expect(proximoPrazo(rrule, '2026-12-30', recesso)).toBe('2027-01-29'); // não volta para 31/12
  });

  it('outras repetições não mudam com feriados', () => {
    const rrule = paraRRule(recorrenciaPadrao('mensal', '2026-10-02'), '2026-10-02');
    expect(proximoPrazo(rrule, '2026-10-02', new Map([['2026-11-02', 'Finados']]))).toBe('2026-11-02');
  });
});
