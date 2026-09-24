// Ações de tarefas e listas usadas pela interface (gravam localmente e devolvem o "desfazer").
import type { Lista, Tarefa } from '../../dominio/tipos';
import { concluirTarefa, novaTarefa, reabrirTarefa } from '../../dominio/tarefas';
import { gravar, LISTA_PADRAO_ID, listarTodos, novoId, salvar } from '../../dados/repositorio';

type Desfazer = () => Promise<void>;

/** Restaura as versões anteriores (ou marca como excluídas as que não existiam). */
function criarDesfazer(anteriores: (Tarefa | undefined)[], atuais: Tarefa[]): Desfazer {
  return async () => {
    await gravar(
      atuais.map((atual, i) => ({
        entidade: 'tarefas' as const,
        registro: anteriores[i] ?? { ...atual, status: 'excluida' as const },
      })),
    );
  };
}

export async function criarTarefaRapida(titulo: string, lista_id: string, prazo: string | null = null) {
  const t = novaTarefa({ id: novoId(), lista_id, titulo: titulo.trim(), prazo });
  await salvar('tarefas', t);
  return t;
}

export async function salvarTarefa(t: Tarefa) {
  await salvar('tarefas', t);
}

/** Concluir ou reabrir. Ao concluir uma recorrente, cria a próxima (RN23). */
export async function alternarConclusao(t: Tarefa): Promise<{ texto: string; desfazer: Desfazer }> {
  if (t.status === 'concluida') {
    const reaberta = reabrirTarefa(t);
    const anteriores = (await gravar([{ entidade: 'tarefas', registro: reaberta }])) as (Tarefa | undefined)[];
    return { texto: 'Tarefa reaberta', desfazer: criarDesfazer(anteriores, [reaberta]) };
  }

  const { concluida, proxima } = concluirTarefa(t, novoId);
  const atuais = proxima ? [concluida, proxima] : [concluida];
  const anteriores = (await gravar(atuais.map((registro) => ({ entidade: 'tarefas' as const, registro })))) as (
    | Tarefa
    | undefined
  )[];
  const texto = proxima ? 'Concluída · próxima criada' : 'Tarefa concluída';
  return { texto, desfazer: criarDesfazer(anteriores, atuais) };
}

/** RN01 — exclusão lógica. */
export async function excluirTarefa(t: Tarefa): Promise<Desfazer> {
  const excluida: Tarefa = { ...t, status: 'excluida' };
  const anteriores = (await gravar([{ entidade: 'tarefas', registro: excluida, operacao: 'excluir' }])) as (
    | Tarefa
    | undefined
  )[];
  return criarDesfazer(anteriores, [excluida]);
}

export async function mudarOrdem(t: Tarefa, ordem: number) {
  await salvar('tarefas', { ...t, ordem });
}

/* ---------------- Listas ---------------- */

export const CORES_LISTA = ['#2f6fed', '#e5484d', '#f5a524', '#30a46c', '#8e4ec6', '#12a594', '#e54666', '#6e56cf', '#978365', '#697386'];

export function novaLista(nome: string, ordem: number): Lista {
  const carimbo = new Date().toISOString();
  return {
    id: novoId(),
    nome: nome.trim(),
    cor: CORES_LISTA[ordem % CORES_LISTA.length],
    ordem,
    ativo: true,
    google_tasklist_id: null,
    criado_em: carimbo,
    atualizado_em: carimbo,
  };
}

export async function salvarLista(l: Lista) {
  await salvar('listas', l);
}

/** RN27 — excluir lista: as tarefas vão para "Geral" e a lista fica inativa. */
export async function excluirLista(l: Lista): Promise<Desfazer> {
  if (l.id === LISTA_PADRAO_ID) throw new Error('A lista Geral não pode ser excluída.');
  const tarefas = (await listarTodos('tarefas')).filter((t) => t.lista_id === l.id && t.status !== 'excluida');
  const movidas = tarefas.map((t) => ({ ...t, lista_id: LISTA_PADRAO_ID }));
  const anteriores = await gravar([
    { entidade: 'listas', registro: { ...l, ativo: false }, operacao: 'excluir' },
    ...movidas.map((registro) => ({ entidade: 'tarefas' as const, registro })),
  ]);
  return async () => {
    await gravar([
      { entidade: 'listas', registro: anteriores[0] as Lista },
      ...tarefas.map((registro) => ({ entidade: 'tarefas' as const, registro })),
    ]);
  };
}
