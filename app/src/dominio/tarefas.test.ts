import { describe, expect, it } from 'vitest';
import type { Tarefa } from './tipos';
import {
  agruparTarefas,
  concluirTarefa,
  estaAtrasada,
  ordemEntre,
  ordenarTarefas,
  reabrirTarefa,
  validarTarefa,
  visivelNaLista,
  novaTarefa,
} from './tarefas';
import { paraRRule, recorrenciaPadrao } from './recorrencia';

const AGORA = new Date(2026, 8, 24, 14, 0); // 24/09/2026 14:00 (local)
let seq = 0;
const t = (campos: Partial<Tarefa> = {}) => novaTarefa({ id: `t${++seq}`, lista_id: 'geral', titulo: 'x', ...campos }, AGORA);
const ids = (lista: Tarefa[]) => lista.map((x) => x.id);

describe('validação (RN20)', () => {
  it('exige título', () => {
    expect(validarTarefa({ titulo: '  ', rrule: null, prazo: null })).toHaveLength(1);
    expect(validarTarefa({ titulo: 'Pagar conta', rrule: null, prazo: null })).toHaveLength(0);
  });
  it('recorrente exige prazo', () => {
    expect(validarTarefa({ titulo: 'a', rrule: 'X', prazo: null })).toHaveLength(1);
  });
});

describe('atraso (RN21)', () => {
  it('prazo de ontem está atrasado', () => {
    expect(estaAtrasada(t({ prazo: '2026-09-23' }), AGORA)).toBe(true);
  });
  it('prazo hoje sem hora não está atrasado', () => {
    expect(estaAtrasada(t({ prazo: '2026-09-24' }), AGORA)).toBe(false);
  });
  it('prazo hoje com hora já passada está atrasado', () => {
    expect(estaAtrasada(t({ prazo: '2026-09-24', prazo_hora: '13:00' }), AGORA)).toBe(true);
    expect(estaAtrasada(t({ prazo: '2026-09-24', prazo_hora: '15:00' }), AGORA)).toBe(false);
  });
  it('concluída nunca está atrasada', () => {
    expect(estaAtrasada(t({ prazo: '2026-09-01', status: 'concluida' }), AGORA)).toBe(false);
  });
});

describe('visibilidade (RN22)', () => {
  it('concluída há menos de 7 dias aparece; depois some', () => {
    expect(visivelNaLista(t({ status: 'concluida', concluida_em: '2026-09-20T10:00:00Z' }), 7, AGORA)).toBe(true);
    expect(visivelNaLista(t({ status: 'concluida', concluida_em: '2026-09-17T10:00:00Z' }), 7, AGORA)).toBe(false);
  });
  it('excluída nunca aparece', () => {
    expect(visivelNaLista(t({ status: 'excluida' }), 7, AGORA)).toBe(false);
  });
});

describe('ordenação (RN24)', () => {
  it('atrasadas → prioridade → prazo → ordem; concluídas no fim', () => {
    const concluida = t({ status: 'concluida', concluida_em: '2026-09-24T10:00:00Z', prioridade: 'alta' });
    const baixaAtrasada = t({ prioridade: 'baixa', prazo: '2026-09-20' });
    const altaSemPrazo = t({ prioridade: 'alta' });
    const altaAmanha = t({ prioridade: 'alta', prazo: '2026-09-25' });
    const media1 = t({ ordem: 1 });
    const media2 = t({ ordem: 2 });
    const ordenadas = ordenarTarefas([concluida, media2, altaSemPrazo, media1, baixaAtrasada, altaAmanha], AGORA);
    expect(ids(ordenadas)).toEqual(ids([baixaAtrasada, altaAmanha, altaSemPrazo, media1, media2, concluida]));
  });

  it('ordemEntre fica entre os vizinhos', () => {
    expect(ordemEntre(10, 20)).toBe(15);
    expect(ordemEntre(undefined, 20)).toBeLessThan(20);
    expect(ordemEntre(10, undefined)).toBeGreaterThan(10);
  });
});

describe('agrupamento', () => {
  it('separa por prazo', () => {
    const grupos = agruparTarefas(
      [t({ prazo: '2026-09-20' }), t({ prazo: '2026-09-24' }), t({ prazo: '2026-09-25' }), t({ prazo: '2026-09-28' }), t({ prazo: '2026-12-01' }), t()],
      AGORA,
    );
    expect(grupos.map((g) => g.grupo)).toEqual(['atrasadas', 'hoje', 'amanha', 'semana', 'depois', 'sem_prazo']);
  });
});

describe('conclusão e recorrência (RN23, RN26)', () => {
  const novoId = () => `nova${++seq}`;

  it('tarefa simples: só conclui', () => {
    const { concluida, proxima } = concluirTarefa(t(), novoId, AGORA);
    expect(concluida.status).toBe('concluida');
    expect(concluida.concluida_em).toBe(AGORA.toISOString());
    expect(proxima).toBeNull();
  });

  it('recorrente: gera a próxima a partir do prazo, não da data de conclusão', () => {
    const rrule = paraRRule(recorrenciaPadrao('semanal', '2026-09-17'), '2026-09-17');
    // prazo era 17/09 (atrasada); concluída em 24/09 → próxima é 24/09 (semana seguinte ao prazo)
    const original = t({ prazo: '2026-09-17', rrule, prioridade: 'alta', google_task_id: 'g1' });
    const { concluida, proxima } = concluirTarefa(original, novoId, AGORA);
    expect(proxima?.prazo).toBe('2026-09-24');
    expect(proxima?.status).toBe('pendente');
    expect(proxima?.prioridade).toBe('alta');
    expect(proxima?.tarefa_origem_id).toBe(original.id);
    expect(proxima?.google_task_id).toBeNull();
    expect(concluida.proxima_gerada_id).toBe(proxima?.id);
  });

  it('reabrir e concluir de novo não duplica a próxima', () => {
    const rrule = paraRRule(recorrenciaPadrao('diaria', '2026-09-24'), '2026-09-24');
    const { concluida } = concluirTarefa(t({ prazo: '2026-09-24', rrule }), novoId, AGORA);
    const reaberta = reabrirTarefa(concluida, AGORA);
    expect(reaberta.status).toBe('pendente');
    expect(reaberta.concluida_em).toBeNull();
    const segunda = concluirTarefa(reaberta, novoId, AGORA);
    expect(segunda.proxima).toBeNull();
  });

  it('série encerrada não gera próxima', () => {
    const rrule = paraRRule({ ...recorrenciaPadrao('diaria', '2026-09-23'), fim: 'contagem', contagem: 2 }, '2026-09-23');
    const { proxima } = concluirTarefa(t({ prazo: '2026-09-24', rrule }), novoId, AGORA);
    expect(proxima).toBeNull();
  });
});
