import { describe, expect, it } from 'vitest';
import type { Compromisso } from './tipos';
import {
  alterarSeguintes,
  alterarSoEsta,
  alterarTodas,
  conflitos,
  excluirSeguintes,
  excluirSoEsta,
  excluirTodas,
  expandirOcorrencias,
  normalizarDiaInteiro,
  novoCompromisso,
  organizarColunas,
  validarCompromisso,
} from './compromissos';
import { deRRule, paraRRule, recorrenciaPadrao, type Recorrencia } from './recorrencia';

let seq = 0;
const novoId = () => `n${++seq}`;
const c = (campos: Partial<Compromisso> & { inicio: string; fim: string }) =>
  novoCompromisso({ id: `c${++seq}`, titulo: 'x', ...campos });

/** Série diária às 09:00–10:00 começando em 21/09/2026 (segunda). */
function serieDiaria(rec: Partial<Recorrencia> = {}) {
  const inicio = '2026-09-21T09:00';
  return c({ inicio, fim: '2026-09-21T10:00', rrule: paraRRule({ ...recorrenciaPadrao('diaria', inicio), ...rec }, inicio) });
}
const datas = (todos: Compromisso[], de = '2026-09-21', ate = '2026-09-27') => expandirOcorrencias(todos, de, ate).map((o) => o.inicio);

describe('validação (RN10, RN11)', () => {
  it('exige título e fim depois do início', () => {
    expect(validarCompromisso({ titulo: '', inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00', dia_inteiro: false })).toHaveLength(1);
    expect(validarCompromisso({ titulo: 'a', inicio: '2026-09-24T10:00', fim: '2026-09-24T10:00', dia_inteiro: false })).toHaveLength(1);
    expect(validarCompromisso({ titulo: 'a', inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00', dia_inteiro: false })).toHaveLength(0);
  });
  it('dia inteiro aceita mesmo dia e ignora horas', () => {
    const d = normalizarDiaInteiro({ inicio: '2026-09-24T15:00', fim: '2026-09-24T08:00', dia_inteiro: true });
    expect(d).toEqual({ inicio: '2026-09-24T00:00', fim: '2026-09-24T23:59', dia_inteiro: true });
    expect(validarCompromisso({ titulo: 'a', ...d })).toHaveLength(0);
  });
});

describe('expansão de ocorrências', () => {
  it('compromisso simples aparece só no seu dia', () => {
    const x = c({ inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00' });
    expect(datas([x])).toEqual(['2026-09-24T10:00']);
    expect(datas([x], '2026-09-25', '2026-09-30')).toEqual([]);
  });

  it('série diária gera uma ocorrência por dia', () => {
    expect(datas([serieDiaria()])).toHaveLength(7);
  });

  it('evento que atravessa a meia-noite aparece nos dois dias', () => {
    const x = c({ inicio: '2026-09-24T22:00', fim: '2026-09-25T02:00' });
    expect(datas([x], '2026-09-25', '2026-09-25')).toEqual(['2026-09-24T22:00']);
  });

  it('ignora excluídos e cancelados', () => {
    expect(datas([c({ inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00', status: 'excluido' })])).toEqual([]);
  });
});

describe('séries: só esta (RN15)', () => {
  it('alterar uma ocorrência cria exceção e remove a original', () => {
    const s = serieDiaria();
    const editado = { ...s, inicio: '2026-09-23T14:00', fim: '2026-09-23T15:00', titulo: 'mudou' };
    const exc = alterarSoEsta(s, '2026-09-23', editado, novoId);
    expect(exc.serie_id).toBe(s.id);
    expect(exc.ocorrencia_original).toBe('2026-09-23T09:00');
    expect(exc.rrule).toBeNull();
    const oc = expandirOcorrencias([s, exc], '2026-09-23', '2026-09-23');
    expect(oc.map((o) => [o.inicio, o.compromisso.titulo])).toEqual([['2026-09-23T14:00', 'mudou']]);
    expect(oc[0].data_original).toBe('2026-09-23');
  });

  it('editar de novo a mesma exceção não cria outra', () => {
    const s = serieDiaria();
    const exc = alterarSoEsta(s, '2026-09-23', { ...s, titulo: 'a' }, novoId);
    const exc2 = alterarSoEsta(s, '2026-09-23', { ...exc, titulo: 'b' }, novoId);
    expect(exc2.id).toBe(exc.id);
  });

  it('excluir uma ocorrência', () => {
    const s = excluirSoEsta(serieDiaria(), '2026-09-23');
    expect(datas([s])).not.toContain('2026-09-23T09:00');
    expect(datas([s])).toHaveLength(6);
  });

  it('excluir o registro de exceção não faz a ocorrência original voltar', () => {
    const s = serieDiaria();
    const exc = { ...alterarSoEsta(s, '2026-09-23', { ...s, titulo: 'a' }, novoId), status: 'excluido' as const };
    expect(datas([s, exc])).toHaveLength(6);
  });
});

describe('séries: esta e as seguintes (RN15)', () => {
  it('divide a série: original termina na véspera e a nova começa na data', () => {
    const s = serieDiaria();
    const editado = { ...s, inicio: '2026-09-24T11:00', fim: '2026-09-24T12:00', titulo: 'novo horário' };
    const [antiga, nova] = alterarSeguintes(s, '2026-09-24', editado, deRRule(s.rrule!), [], novoId);
    const oc = expandirOcorrencias([antiga, nova], '2026-09-21', '2026-09-27');
    expect(oc.map((o) => o.inicio)).toEqual([
      '2026-09-21T09:00', '2026-09-22T09:00', '2026-09-23T09:00',
      '2026-09-24T11:00', '2026-09-25T11:00', '2026-09-26T11:00', '2026-09-27T11:00',
    ]);
    expect(nova.id).not.toBe(s.id);
  });

  it('mantém o total quando a série termina após N vezes', () => {
    const s = serieDiaria({ fim: 'contagem', contagem: 5 }); // 21 a 25
    const [antiga, nova] = alterarSeguintes(s, '2026-09-23', { ...s, inicio: '2026-09-23T09:00', fim: '2026-09-23T10:00' }, deRRule(s.rrule!), [], novoId);
    expect(datas([antiga])).toHaveLength(2);
    expect(datas([nova])).toHaveLength(3);
  });

  it('descarta exceções futuras da série antiga', () => {
    const s = serieDiaria();
    const passada = alterarSoEsta(s, '2026-09-22', { ...s, titulo: 'p' }, novoId);
    const futura = alterarSoEsta(s, '2026-09-26', { ...s, titulo: 'f' }, novoId);
    const r = alterarSeguintes(s, '2026-09-24', { ...s, inicio: '2026-09-24T09:00', fim: '2026-09-24T10:00' }, deRRule(s.rrule!), [passada, futura], novoId);
    expect(r.find((x) => x.id === futura.id)?.status).toBe('excluido');
    expect(r.find((x) => x.id === passada.id)).toBeUndefined();
  });

  it('na primeira ocorrência equivale a "todas"', () => {
    const s = serieDiaria();
    const r = alterarSeguintes(s, '2026-09-21', { ...s, titulo: 'todas' }, deRRule(s.rrule!), [], novoId);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(s.id);
  });

  it('excluir esta e as seguintes', () => {
    const s = serieDiaria();
    const [antiga] = excluirSeguintes(s, '2026-09-24', []);
    expect(datas([antiga])).toHaveLength(3);
    expect(excluirSeguintes(s, '2026-09-21', [])[0].status).toBe('excluido');
  });
});

describe('séries: todas (RN15)', () => {
  it('mudar o horário numa ocorrência do meio desloca a série inteira', () => {
    const s = serieDiaria();
    const editado = { ...s, inicio: '2026-09-24T10:30', fim: '2026-09-24T11:30' };
    const [nova] = alterarTodas(s, '2026-09-24T09:00', editado, deRRule(s.rrule!), []);
    expect(nova.id).toBe(s.id);
    expect(nova.inicio).toBe('2026-09-21T10:30');
    expect(datas([nova])[0]).toBe('2026-09-21T10:30');
  });

  it('preserva exclusões da série', () => {
    const s = excluirSoEsta(serieDiaria(), '2026-09-23');
    const [nova] = alterarTodas(s, s.inicio, { ...s, titulo: 'y' }, deRRule(s.rrule!), []);
    expect(datas([nova])).toHaveLength(6);
  });

  it('remover a repetição vira compromisso único', () => {
    const s = serieDiaria();
    const [unico] = alterarTodas(s, '2026-09-24T09:00', { ...s, inicio: '2026-09-24T09:00', fim: '2026-09-24T10:00' }, null, []);
    expect(unico.rrule).toBeNull();
    expect(datas([unico])).toEqual(['2026-09-24T09:00']);
  });

  it('excluir todas', () => {
    expect(excluirTodas(serieDiaria(), [])[0].status).toBe('excluido');
  });
});

describe('conflitos (RN12)', () => {
  it('detecta sobreposição e ignora dia inteiro e o próprio evento', () => {
    const a = c({ inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00' });
    const b = c({ inicio: '2026-09-24T11:00', fim: '2026-09-24T12:00' }); // encosta, não sobrepõe
    const dia = c({ inicio: '2026-09-24T00:00', fim: '2026-09-24T23:59', dia_inteiro: true });
    const oc = expandirOcorrencias([a, b, dia], '2026-09-24', '2026-09-24');
    const r = conflitos({ inicio: '2026-09-24T10:30', fim: '2026-09-24T11:30', dia_inteiro: false }, oc);
    expect(r.map((o) => o.compromisso.id).sort()).toEqual([a.id, b.id].sort());
    expect(conflitos({ inicio: '2026-09-24T10:00', fim: '2026-09-24T11:00', dia_inteiro: false, chave: a.id }, oc)).toHaveLength(0);
  });
});

describe('colunas lado a lado', () => {
  it('eventos sobrepostos dividem a largura', () => {
    const r = organizarColunas([
      { inicio: '09:00', fim: '10:00', n: 'a' },
      { inicio: '09:30', fim: '10:30', n: 'b' },
      { inicio: '10:00', fim: '11:00', n: 'c' },
      { inicio: '12:00', fim: '13:00', n: 'd' },
    ]);
    const por = Object.fromEntries(r.map((p) => [p.item.n, [p.coluna, p.colunas]]));
    expect(por).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });
});
