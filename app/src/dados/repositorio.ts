// Leitura e gravação local + registro na fila de sincronização (RN01, RN02, RN04, RS02).
import { abrirBanco } from './db';
import type { Categoria, Compromisso, Config, Entidade, Evento, ItemFila, Lista, Pessoa, Registro, Tarefa } from '../dominio/tipos';
import { CONFIG_PADRAO } from '../dominio/tipos';

export type MapaEntidades = {
  tarefas: Tarefa;
  listas: Lista;
  compromissos: Compromisso;
  categorias: Categoria;
  pessoas: Pessoa;
  eventos: Evento;
};

export const novoId = (): string => crypto.randomUUID();

/* ---------------- Avisos de mudança (para a interface se atualizar) ---------------- */

const ouvintes = new Set<() => void>();

export function aoMudarDados(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisarMudanca() {
  ouvintes.forEach((fn) => fn());
}

/* ---------------- Leitura ---------------- */

export async function listarTodos<E extends Entidade>(entidade: E): Promise<MapaEntidades[E][]> {
  const db = await abrirBanco();
  return (await db.getAll(entidade)) as MapaEntidades[E][];
}

export async function buscar<E extends Entidade>(entidade: E, id: string): Promise<MapaEntidades[E] | undefined> {
  const db = await abrirBanco();
  return (await db.get(entidade, id)) as MapaEntidades[E] | undefined;
}

/* ---------------- Gravação ---------------- */

export type Alteracao = {
  [E in Entidade]: {
    entidade: E;
    registro: MapaEntidades[E];
    /** Exclusão lógica: o registro continua salvo, com status "excluido"/"excluida". */
    operacao?: 'excluir';
  };
}[Entidade];

/**
 * Grava um ou mais registros numa única transação e coloca cada um na fila de sincronização.
 * Alterações seguidas no mesmo registro são compactadas: a fila guarda só a versão mais recente.
 * Retorna as versões anteriores (para "Desfazer").
 */
export async function gravar(alteracoes: Alteracao[], agora = new Date()): Promise<(Registro | undefined)[]> {
  const db = await abrirBanco();
  const nomes = [...new Set<Entidade | 'fila_sync'>([...alteracoes.map((a) => a.entidade), 'fila_sync'])];
  const tx = db.transaction(nomes, 'readwrite');
  const fila = tx.objectStore('fila_sync');
  const carimbo = agora.toISOString();
  const anteriores: (Registro | undefined)[] = [];

  for (const { entidade, registro, operacao } of alteracoes) {
    const loja = tx.objectStore(entidade);
    const anterior = (await loja.get(registro.id)) as Registro | undefined;
    anteriores.push(anterior);

    const salvo = {
      ...registro,
      criado_em: anterior?.criado_em ?? registro.criado_em ?? carimbo,
      atualizado_em: carimbo,
    };
    await loja.put(salvo as never);

    const existente = (await fila.index('registro_id').getAll(registro.id)).find((i) => i.entidade === entidade);
    const op: ItemFila['operacao'] = operacao ?? (anterior ? 'alterar' : 'criar');
    await fila.put({
      id: existente?.id ?? novoId(),
      entidade,
      registro_id: registro.id,
      // Se ainda não foi enviado ao servidor, continua sendo uma criação
      operacao: existente?.operacao === 'criar' ? 'criar' : op,
      payload: salvo,
      tentativas: 0,
      ultimo_erro: null,
      criado_em: existente?.criado_em ?? carimbo,
    });
  }

  await tx.done;
  avisarMudanca();
  return anteriores;
}

export async function salvar<E extends Entidade>(entidade: E, registro: MapaEntidades[E]) {
  const [anterior] = await gravar([{ entidade, registro } as Alteracao]);
  return anterior as MapaEntidades[E] | undefined;
}

export async function contarPendentes(): Promise<number> {
  const db = await abrirBanco();
  return db.count('fila_sync');
}

/* ---------------- Configurações ---------------- */

export async function lerConfig(): Promise<Config> {
  const db = await abrirBanco();
  const itens = await db.getAll('config');
  const salvo = Object.fromEntries(itens.map((i) => [i.chave, i.valor]));
  return { ...CONFIG_PADRAO, ...salvo } as Config;
}

export async function salvarConfig(parcial: Partial<Config>) {
  const db = await abrirBanco();
  const tx = db.transaction('config', 'readwrite');
  for (const [chave, valor] of Object.entries(parcial)) await tx.store.put({ chave, valor });
  await tx.done;
  avisarMudanca();
}

/* ---------------- Dados iniciais ---------------- */

export const LISTA_PADRAO_ID = 'geral';

/** Cria a lista "Geral" na primeira execução (id fixo, para não duplicar ao restaurar). */
export async function garantirDadosIniciais(agora = new Date()) {
  const db = await abrirBanco();
  if (await db.get('listas', LISTA_PADRAO_ID)) return;
  const carimbo = agora.toISOString();
  await gravar(
    [
      {
        entidade: 'listas',
        registro: {
          id: LISTA_PADRAO_ID,
          nome: 'Geral',
          cor: '#2f6fed',
          ordem: 0,
          ativo: true,
          google_tasklist_id: null,
          criado_em: carimbo,
          atualizado_em: carimbo,
        },
      },
    ],
    agora,
  );
}

/** RS09 — pede ao navegador para não apagar os dados locais. */
export async function pedirArmazenamentoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
