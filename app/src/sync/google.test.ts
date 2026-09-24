// Testa a tradução dos registros do app para eventos do Google Agenda (backend/google_eventos.js).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { novoCompromisso, alterarSoEsta } from '../dominio/compromissos';
import { paraRRule, recorrenciaPadrao } from '../dominio/recorrencia';
import { novoEvento } from '../dominio/ferias';
import { novaPessoa } from '../dominio/pessoas';

const require = createRequire(import.meta.url);
const g = require('../../../backend/google_eventos.js');

const semExcecoes = { pessoas: {}, excecoesDe: () => [] };
const comp = (campos: object) => novoCompromisso({ id: 'c1', titulo: 'Reunião', inicio: '2026-09-21T09:00', fim: '2026-09-21T10:00', ...campos });

describe('compromissos → Google', () => {
  it('evento com horário, local, lembretes', () => {
    const r = g.montarEventoGoogle('compromissos', comp({ local: 'Sala 2', lembretes: [10, 60] }), semExcecoes);
    expect(r.agenda).toBe('principal');
    expect(r.evento).toMatchObject({
      summary: 'Reunião',
      location: 'Sala 2',
      start: { dateTime: '2026-09-21T09:00:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-09-21T10:00:00', timeZone: 'America/Sao_Paulo' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }, { method: 'popup', minutes: 60 }] },
    });
  });

  it('dia inteiro: fim exclusivo no Google', () => {
    const r = g.montarEventoGoogle('compromissos', comp({ dia_inteiro: true, inicio: '2026-09-24T00:00', fim: '2026-09-25T23:59' }), semExcecoes);
    expect(r.evento.start).toEqual({ date: '2026-09-24' });
    expect(r.evento.end).toEqual({ date: '2026-09-26' });
  });

  it('não deve existir no Google: excluído ou sem sincronização', () => {
    expect(g.montarEventoGoogle('compromissos', comp({ status: 'excluido' }), semExcecoes)).toBeNull();
    expect(g.montarEventoGoogle('compromissos', comp({ sync_google: false }), semExcecoes)).toBeNull();
  });

  it('série: RRULE sem DTSTART e UNTIL convertido para UTC real', () => {
    const rec = { ...recorrenciaPadrao('semanal', '2026-09-21T21:00'), fim: 'data' as const, ate: '2026-10-05' };
    const rrule = paraRRule(rec, '2026-09-21T21:00');
    const r = g.montarEventoGoogle('compromissos', comp({ inicio: '2026-09-21T21:00', fim: '2026-09-21T22:00', rrule }), semExcecoes);
    // 05/10 23:59:59 em Brasília = 06/10 02:59:59 UTC (a ocorrência de 05/10 às 21h continua incluída)
    expect(r.evento.recurrence).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20261006T025959Z']);
  });

  it('série de dia inteiro: UNTIL só com a data', () => {
    const rec = { ...recorrenciaPadrao('diaria', '2026-09-21'), fim: 'data' as const, ate: '2026-09-30' };
    expect(g.regraParaGoogle(paraRRule(rec, '2026-09-21'), true)).toBe('RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260930');
  });

  it('exclusões e ocorrências alteradas entram no EXDATE; a alterada vira evento avulso', () => {
    const rrule = paraRRule(recorrenciaPadrao('diaria', '2026-09-21T09:00'), '2026-09-21T09:00');
    const serie = comp({ rrule, excecoes: ['2026-09-23'] });
    const alterada = alterarSoEsta(serie, '2026-09-25', { ...serie, inicio: '2026-09-25T14:00', fim: '2026-09-25T15:00' }, () => 'c2');
    const ctx = { pessoas: {}, excecoesDe: (id: string) => (id === serie.id ? [alterada] : []) };
    const r = g.montarEventoGoogle('compromissos', serie, ctx);
    expect(r.evento.recurrence[1]).toBe('EXDATE;TZID=America/Sao_Paulo:20260923T090000,20260925T090000');
    const avulso = g.montarEventoGoogle('compromissos', alterada, ctx);
    expect(avulso.evento.recurrence).toBeUndefined();
    expect(avulso.evento.start.dateTime).toBe('2026-09-25T14:00:00');
  });

  it('alterar uma exceção também reenvia a série', () => {
    expect(g.dependentesGoogle('compromissos', { id: 'c2', serie_id: 'c1' }, {})).toEqual(['compromissos:c2', 'compromissos:c1']);
  });
});

describe('férias → Google', () => {
  const ana = novaPessoa({ id: 'ana', nome: 'Ana Souza', apelido: 'Aninha' });
  const ctx = { pessoas: { ana }, excecoesDe: () => [] };

  it('férias da equipe: agenda da equipe, título com a pessoa, dia inteiro, "livre"', () => {
    const e = novoEvento({ id: 'e1', tipo: 'ferias_equipe', pessoa_id: 'ana', data_inicio: '2026-10-05', data_fim: '2026-10-16' });
    const r = g.montarEventoGoogle('eventos', e, ctx);
    expect(r.agenda).toBe('ferias_equipe');
    expect(r.evento).toMatchObject({ summary: '🌴 Férias – Aninha', start: { date: '2026-10-05' }, end: { date: '2026-10-17' }, transparency: 'transparent' });
  });

  it('minhas férias: agenda pessoal', () => {
    const e = novoEvento({ id: 'e2', tipo: 'ferias_pessoais', data_inicio: '2026-12-20', data_fim: '2027-01-05' });
    expect(g.montarEventoGoogle('eventos', e, ctx).agenda).toBe('ferias_pessoais');
  });

  it('renomear a pessoa reenvia as férias dela', () => {
    const e = novoEvento({ id: 'e1', tipo: 'ferias_equipe', pessoa_id: 'ana', data_inicio: '2026-10-05', data_fim: '2026-10-16' });
    expect(g.dependentesGoogle('pessoas', ana, { eventos: [e] })).toEqual(['pessoas:ana', 'eventos:e1']);
  });
});

describe('aniversários → Google', () => {
  it('evento anual com lembrete na véspera', () => {
    const r = g.montarEventoGoogle('pessoas', novaPessoa({ id: 'p', nome: 'Ana', data_nascimento: '1990-10-02' }), semExcecoes);
    expect(r.agenda).toBe('aniversarios');
    expect(r.evento).toMatchObject({
      summary: '🎂 Ana',
      start: { date: '1990-10-02' },
      recurrence: ['RRULE:FREQ=YEARLY'],
      reminders: { overrides: [{ method: 'popup', minutes: 900 }] },
    });
  });

  it('29/02 vira último dia de fevereiro; sem ano usa 2000', () => {
    const r = g.montarEventoGoogle('pessoas', novaPessoa({ id: 'p', nome: 'Caio', data_nascimento: '--02-29' }), semExcecoes);
    expect(r.evento.start).toEqual({ date: '2000-02-29' });
    expect(r.evento.recurrence).toEqual(['RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1']);
  });

  it('pessoa inativa ou sem data não aparece', () => {
    expect(g.montarEventoGoogle('pessoas', novaPessoa({ id: 'p', nome: 'X', data_nascimento: '1990-01-01', ativo: false }), semExcecoes)).toBeNull();
    expect(g.montarEventoGoogle('pessoas', novaPessoa({ id: 'p', nome: 'X' }), semExcecoes)).toBeNull();
  });
});
