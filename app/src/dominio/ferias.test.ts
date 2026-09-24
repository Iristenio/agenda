import { describe, expect, it } from 'vitest';
import type { Evento } from './tipos';
import {
  agruparDias,
  diasAcimaDoLimite,
  diasCorridos,
  diasUteis,
  feriasNoDia,
  minhasFeriasEm,
  novoEvento,
  sobreposicoesMesmaPessoa,
  tituloEvento,
  validarEvento,
} from './ferias';
import { novaPessoa } from './pessoas';

let seq = 0;
const ev = (data_inicio: string, data_fim: string, campos: Partial<Evento> = {}) =>
  novoEvento({ id: `e${++seq}`, data_inicio, data_fim, tipo: 'ferias_equipe', pessoa_id: 'ana', ...campos });

describe('validação', () => {
  it('fim antes do início e pessoa obrigatória nas férias da equipe', () => {
    expect(validarEvento(ev('2026-10-10', '2026-10-05'))).toHaveLength(1);
    expect(validarEvento(ev('2026-10-05', '2026-10-10', { pessoa_id: null }))).toHaveLength(1);
    expect(validarEvento(ev('2026-10-05', '2026-10-05', { tipo: 'ferias_pessoais', pessoa_id: null }))).toHaveLength(0);
    expect(validarEvento(ev('2026-10-05', '2026-10-05', { tipo: 'outro', titulo: '' }))).toHaveLength(1);
  });
});

describe('contagem de dias (RN34)', () => {
  it('dias corridos e úteis', () => {
    // 05/10/2026 (segunda) a 18/10/2026 (domingo)
    expect(diasCorridos('2026-10-05', '2026-10-18')).toBe(14);
    expect(diasUteis('2026-10-05', '2026-10-18')).toBe(10);
    expect(diasUteis('2026-10-10', '2026-10-11')).toBe(0); // fim de semana
  });
});

describe('sobreposição e limite (RN35, RN36)', () => {
  it('detecta férias sobrepostas da mesma pessoa', () => {
    const a = ev('2026-10-01', '2026-10-10');
    const b = ev('2026-10-08', '2026-10-15');
    const outraPessoa = ev('2026-10-01', '2026-10-10', { pessoa_id: 'bia' });
    expect(sobreposicoesMesmaPessoa(b, [a, b, outraPessoa]).map((e) => e.id)).toEqual([a.id]);
  });

  it('minhas férias contam como uma pessoa', () => {
    const eu1 = ev('2026-10-01', '2026-10-10', { tipo: 'ferias_pessoais', pessoa_id: null });
    const eu2 = ev('2026-10-05', '2026-10-06', { tipo: 'ferias_pessoais', pessoa_id: null });
    expect(sobreposicoesMesmaPessoa(eu2, [eu1, eu2])).toHaveLength(1);
  });

  it('aponta os dias com mais ausentes que o limite', () => {
    const lista = [
      ev('2026-10-01', '2026-10-10', { pessoa_id: 'ana' }),
      ev('2026-10-05', '2026-10-12', { pessoa_id: 'bia' }),
      ev('2026-10-08', '2026-10-09', { tipo: 'ferias_pessoais', pessoa_id: null }),
      ev('2026-10-08', '2026-10-09', { pessoa_id: 'caio', status: 'excluido' }),
    ];
    expect(diasAcimaDoLimite(lista, 2, '2026-10-01', '2026-10-31')).toEqual([
      { dia: '2026-10-08', ausentes: 3 },
      { dia: '2026-10-09', ausentes: 3 },
    ]);
    expect(agruparDias(['2026-10-09', '2026-10-08', '2026-10-20'])).toEqual([
      { de: '2026-10-08', ate: '2026-10-09' },
      { de: '2026-10-20', ate: '2026-10-20' },
    ]);
  });

  it('quem está de férias no dia e minhas férias num intervalo (RN13)', () => {
    const minhas = ev('2026-12-20', '2027-01-05', { tipo: 'ferias_pessoais', pessoa_id: null });
    const outro = ev('2026-12-20', '2026-12-31', { tipo: 'outro', titulo: 'Congresso' });
    expect(feriasNoDia([minhas, outro], '2026-12-25').map((e) => e.id)).toEqual([minhas.id]);
    expect(minhasFeriasEm([minhas], '2027-01-05', '2027-01-05')).toHaveLength(1);
    expect(minhasFeriasEm([minhas], '2027-01-06', '2027-01-06')).toHaveLength(0);
  });
});

describe('título automático', () => {
  it('usa o apelido da pessoa', () => {
    const pessoas = new Map([['ana', novaPessoa({ id: 'ana', nome: 'Ana Souza', apelido: 'Aninha' })]]);
    expect(tituloEvento(ev('2026-10-01', '2026-10-02'), pessoas)).toBe('Férias – Aninha');
    expect(tituloEvento(ev('2026-10-01', '2026-10-02', { tipo: 'ferias_pessoais' }), pessoas)).toBe('Minhas férias');
    expect(tituloEvento(ev('2026-10-01', '2026-10-02', { titulo: 'Licença' }), pessoas)).toBe('Licença');
  });
});
