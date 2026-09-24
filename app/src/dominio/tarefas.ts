// Regras de negócio das tarefas (RN20–RN27).
import type { Id, Prioridade, Tarefa } from './tipos';
import { diferencaDias, hojeISO, paraHora } from './datas';
import { proximaData } from './recorrencia';

export const PESO_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

export function novaTarefa(campos: Partial<Tarefa> & { id: Id; lista_id: Id }, agora = new Date()): Tarefa {
  const carimbo = agora.toISOString();
  return {
    titulo: '',
    descricao: '',
    prioridade: 'media',
    prazo: null,
    prazo_hora: null,
    rrule: null,
    status: 'pendente',
    concluida_em: null,
    ordem: agora.getTime(),
    tarefa_origem_id: null,
    proxima_gerada_id: null,
    sync_google: true,
    google_task_id: null,
    criado_em: carimbo,
    atualizado_em: carimbo,
    ...campos,
  };
}

/** RN20 — retorna a lista de erros (vazia = válida). */
export function validarTarefa(t: Pick<Tarefa, 'titulo' | 'rrule' | 'prazo'>): string[] {
  const erros: string[] = [];
  if (!t.titulo.trim()) erros.push('Informe o título da tarefa.');
  if (t.rrule && !t.prazo) erros.push('Tarefas que se repetem precisam de um prazo.');
  return erros;
}

export const estaAberta = (t: Tarefa) => t.status === 'pendente' || t.status === 'andamento';

/** RN21 — prazo vencido e não concluída. Com hora definida, vence na hora; sem hora, no fim do dia. */
export function estaAtrasada(t: Tarefa, agora = new Date()): boolean {
  if (!estaAberta(t) || !t.prazo) return false;
  const hoje = hojeISO(agora);
  if (t.prazo < hoje) return true;
  return t.prazo === hoje && !!t.prazo_hora && t.prazo_hora < paraHora(agora);
}

/** RN22 — concluídas continuam visíveis por N dias; excluídas nunca aparecem. */
export function visivelNaLista(t: Tarefa, diasManter: number, agora = new Date()): boolean {
  if (t.status === 'excluida') return false;
  if (t.status !== 'concluida') return true;
  if (!t.concluida_em) return true;
  return diferencaDias(t.concluida_em.slice(0, 10), hojeISO(agora)) < diasManter;
}

/** RN24 — atrasadas → prioridade → prazo (sem prazo por último) → ordem manual. */
export function compararTarefas(a: Tarefa, b: Tarefa, agora = new Date()): number {
  const conclA = a.status === 'concluida' ? 1 : 0;
  const conclB = b.status === 'concluida' ? 1 : 0;
  if (conclA !== conclB) return conclA - conclB;
  if (conclA) return (b.concluida_em ?? '').localeCompare(a.concluida_em ?? '');

  const atrA = estaAtrasada(a, agora) ? 0 : 1;
  const atrB = estaAtrasada(b, agora) ? 0 : 1;
  if (atrA !== atrB) return atrA - atrB;

  const prio = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
  if (prio) return prio;

  const prazoA = a.prazo ? a.prazo + (a.prazo_hora ?? '99:99') : '9999';
  const prazoB = b.prazo ? b.prazo + (b.prazo_hora ?? '99:99') : '9999';
  if (prazoA !== prazoB) return prazoA.localeCompare(prazoB);

  return a.ordem - b.ordem;
}

export function ordenarTarefas(lista: Tarefa[], agora = new Date()): Tarefa[] {
  return [...lista].sort((a, b) => compararTarefas(a, b, agora));
}

/* ---------------- Agrupamento para exibição ---------------- */

export type Grupo = 'atrasadas' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'sem_prazo' | 'concluidas';

export const TITULO_GRUPO: Record<Grupo, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  semana: 'Próximos 7 dias',
  depois: 'Mais tarde',
  sem_prazo: 'Sem prazo',
  concluidas: 'Concluídas',
};

export function grupoDaTarefa(t: Tarefa, agora = new Date()): Grupo {
  if (t.status === 'concluida') return 'concluidas';
  if (estaAtrasada(t, agora)) return 'atrasadas';
  if (!t.prazo) return 'sem_prazo';
  const dif = diferencaDias(hojeISO(agora), t.prazo);
  if (dif <= 0) return 'hoje';
  if (dif === 1) return 'amanha';
  if (dif <= 7) return 'semana';
  return 'depois';
}

export function agruparTarefas(lista: Tarefa[], agora = new Date()): { grupo: Grupo; tarefas: Tarefa[] }[] {
  const ordem = Object.keys(TITULO_GRUPO) as Grupo[];
  const mapa = new Map<Grupo, Tarefa[]>();
  for (const t of ordenarTarefas(lista, agora)) {
    const g = grupoDaTarefa(t, agora);
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(t);
  }
  return ordem.filter((g) => mapa.has(g)).map((grupo) => ({ grupo, tarefas: mapa.get(grupo)! }));
}

/* ---------------- Conclusão e recorrência ---------------- */

export interface ResultadoConclusao {
  concluida: Tarefa;
  proxima: Tarefa | null;
}

/**
 * RN22/RN23 — conclui a tarefa. Se for recorrente e ainda não tiver gerado a próxima,
 * cria a próxima ocorrência com prazo calculado a partir do prazo anterior.
 */
export function concluirTarefa(t: Tarefa, novoId: () => Id, agora = new Date()): ResultadoConclusao {
  const carimbo = agora.toISOString();
  let proxima: Tarefa | null = null;

  if (t.rrule && t.prazo && !t.proxima_gerada_id) {
    const data = proximaData(t.rrule, t.prazo);
    if (data) {
      proxima = {
        ...t,
        id: novoId(),
        prazo: data,
        status: 'pendente',
        concluida_em: null,
        tarefa_origem_id: t.id,
        proxima_gerada_id: null,
        google_task_id: null,
        criado_em: carimbo,
        atualizado_em: carimbo,
      };
    }
  }

  const concluida: Tarefa = {
    ...t,
    status: 'concluida',
    concluida_em: carimbo,
    proxima_gerada_id: proxima?.id ?? t.proxima_gerada_id,
    atualizado_em: carimbo,
  };
  return { concluida, proxima };
}

/** RN26 — reabrir limpa a conclusão e mantém a próxima ocorrência já gerada. */
export function reabrirTarefa(t: Tarefa, agora = new Date()): Tarefa {
  return { ...t, status: 'pendente', concluida_em: null, atualizado_em: agora.toISOString() };
}

/** Ordem manual: valor entre dois vizinhos (permite reordenar sem renumerar a lista). */
export function ordemEntre(anterior: number | undefined, seguinte: number | undefined): number {
  if (anterior === undefined && seguinte === undefined) return Date.now();
  if (anterior === undefined) return seguinte! - 1000;
  if (seguinte === undefined) return anterior + 1000;
  return (anterior + seguinte) / 2;
}
