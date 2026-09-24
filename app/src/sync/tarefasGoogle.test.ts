// Testa a tradução app ↔ Google Tasks (backend/google_tarefas.js).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { novaTarefa } from '../dominio/tarefas';

const require = createRequire(import.meta.url);
const g = require('../../../backend/google_tarefas.js');
const AGORA = '2026-09-24T15:00:00.000Z';
const t = (campos: object = {}) => novaTarefa({ id: 't1', lista_id: 'geral', titulo: 'Pagar luz', ...campos });

describe('app → Google Tasks', () => {
  it('prioridade vira prefixo nas notas; prazo só com a data', () => {
    const r = g.montarTarefaGoogle(t({ prioridade: 'alta', descricao: 'Conta de setembro', prazo: '2026-09-30', prazo_hora: '14:00' }));
    expect(r).toEqual({
      lista: 'geral',
      tarefa: { title: 'Pagar luz', notes: '[ALTA] Conta de setembro', status: 'needsAction', due: '2026-09-30T00:00:00.000Z' },
    });
    expect(g.montarTarefaGoogle(t()).tarefa.notes).toBe('');
  });

  it('concluída leva a data de conclusão', () => {
    const r = g.montarTarefaGoogle(t({ status: 'concluida', concluida_em: AGORA }));
    expect(r.tarefa).toMatchObject({ status: 'completed', completed: AGORA });
  });

  it('excluída, ou sem sincronização, não existe no Google', () => {
    expect(g.montarTarefaGoogle(t({ status: 'excluida' }))).toBeNull();
    expect(g.montarTarefaGoogle(t({ sync_google: false }))).toBeNull();
  });

  it('listas', () => {
    expect(g.montarListaGoogle({ nome: 'Casa', ativo: true })).toEqual({ title: 'Casa' });
    expect(g.montarListaGoogle({ nome: 'Casa', ativo: false })).toBeNull();
  });
});

describe('Google Tasks → app (RT02–RT08)', () => {
  it('conclusão feita no Google', () => {
    const r = g.aplicarTarefaDoGoogle({ id: 'x', title: 'Pagar luz', status: 'completed', completed: AGORA }, t(), 'geral', AGORA);
    expect(r).toMatchObject({ status: 'concluida', concluida_em: AGORA });
  });

  it('reaberta no Google', () => {
    const r = g.aplicarTarefaDoGoogle({ id: 'x', title: 'Pagar luz', status: 'needsAction' }, t({ status: 'concluida', concluida_em: AGORA }), 'geral', AGORA);
    expect(r).toMatchObject({ status: 'pendente', concluida_em: null });
  });

  it('"em andamento" continua assim se só o título mudou', () => {
    const r = g.aplicarTarefaDoGoogle({ id: 'x', title: 'Novo título', status: 'needsAction' }, t({ status: 'andamento' }), 'geral', AGORA);
    expect(r).toMatchObject({ titulo: 'Novo título', status: 'andamento' });
  });

  it('prazo: mesma data mantém a hora; data nova descarta a hora (RT04)', () => {
    const atual = t({ prazo: '2026-09-30', prazo_hora: '14:00' });
    expect(g.aplicarTarefaDoGoogle({ id: 'x', title: 'a', status: 'needsAction', due: '2026-09-30T00:00:00.000Z' }, atual, 'geral', AGORA).prazo_hora).toBe('14:00');
    const mudou = g.aplicarTarefaDoGoogle({ id: 'x', title: 'a', status: 'needsAction', due: '2026-10-02T00:00:00.000Z' }, atual, 'geral', AGORA);
    expect(mudou).toMatchObject({ prazo: '2026-10-02', prazo_hora: null });
    expect(g.aplicarTarefaDoGoogle({ id: 'x', title: 'a', status: 'needsAction' }, atual, 'geral', AGORA).prazo).toBeNull();
  });

  it('prioridade lida do prefixo (RT05)', () => {
    expect(g.aplicarTarefaDoGoogle({ id: 'x', title: 'a', notes: '[BAIXA] detalhe', status: 'needsAction' }, t(), 'geral', AGORA)).toMatchObject({
      prioridade: 'baixa',
      descricao: 'detalhe',
    });
    // prefixo apagado no Google → volta a ser média
    expect(g.aplicarTarefaDoGoogle({ id: 'x', title: 'a', notes: 'detalhe', status: 'needsAction' }, t({ prioridade: 'alta' }), 'geral', AGORA).prioridade).toBe('media');
  });

  it('excluída no Google vira excluída no app (RT08)', () => {
    expect(g.aplicarTarefaDoGoogle({ id: 'x', deleted: true }, t(), 'geral', AGORA).status).toBe('excluida');
  });

  it('tarefa nova criada no Google (RT03)', () => {
    const r = g.aplicarTarefaDoGoogle({ id: 'abc', title: 'Comprar leite', notes: '', status: 'needsAction', updated: AGORA }, null, 'lista-casa', AGORA);
    expect(r).toMatchObject({ id: 'g-abc', titulo: 'Comprar leite', lista_id: 'lista-casa', prioridade: 'media', status: 'pendente', sync_google: true });
  });

  it('conflito: alteração local pendente vence, exceto a conclusão (RT07)', () => {
    expect(g.resolverConflito({ status: 'needsAction' }, t(), false)).toBe('aplicar');
    expect(g.resolverConflito({ status: 'needsAction' }, t(), true)).toBe('ignorar');
    expect(g.resolverConflito({ status: 'completed' }, t(), true)).toBe('so_conclusao');
  });
});
