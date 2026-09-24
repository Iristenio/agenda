// Banco local (IndexedDB) — a FONTE DA VERDADE do app (RN04).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Categoria, Compromisso, Evento, Externo, ItemFila, Lista, Pessoa, Tarefa } from '../dominio/tipos';

export interface AgendaDB extends DBSchema {
  tarefas: { key: string; value: Tarefa; indexes: { lista_id: string } };
  listas: { key: string; value: Lista };
  compromissos: { key: string; value: Compromisso };
  categorias: { key: string; value: Categoria };
  pessoas: { key: string; value: Pessoa };
  eventos: { key: string; value: Evento };
  fila_sync: { key: string; value: ItemFila; indexes: { registro_id: string } };
  config: { key: string; value: { chave: string; valor: unknown } };
  externos: { key: string; value: Externo };
}

export const NOME_BANCO = 'agenda';
const VERSAO = 2;

let conexao: Promise<IDBPDatabase<AgendaDB>> | null = null;

export function abrirBanco(): Promise<IDBPDatabase<AgendaDB>> {
  conexao ??= openDB<AgendaDB>(NOME_BANCO, VERSAO, {
    upgrade(db, versaoAntiga) {
      if (versaoAntiga < 1) {
        db.createObjectStore('tarefas', { keyPath: 'id' }).createIndex('lista_id', 'lista_id');
        db.createObjectStore('listas', { keyPath: 'id' });
        db.createObjectStore('compromissos', { keyPath: 'id' });
        db.createObjectStore('categorias', { keyPath: 'id' });
        db.createObjectStore('pessoas', { keyPath: 'id' });
        db.createObjectStore('eventos', { keyPath: 'id' });
        db.createObjectStore('fila_sync', { keyPath: 'id' }).createIndex('registro_id', 'registro_id');
        db.createObjectStore('config', { keyPath: 'chave' });
      }
      if (versaoAntiga < 2) {
        // Eventos do Google criados fora do app (substituídos a cada busca)
        db.createObjectStore('externos', { keyPath: 'id' });
      }
    },
  });
  return conexao;
}

/** Só para testes: fecha e esquece a conexão atual. */
export async function fecharBanco() {
  if (conexao) (await conexao).close();
  conexao = null;
}
