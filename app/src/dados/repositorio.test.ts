import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, fecharBanco, NOME_BANCO } from './db';
import { garantirDadosIniciais, gravar, LISTA_PADRAO_ID, listarTodos, salvar } from './repositorio';
import { novaTarefa } from '../dominio/tarefas';

beforeEach(async () => {
  await fecharBanco();
  await new Promise<void>((ok) => {
    const req = indexedDB.deleteDatabase(NOME_BANCO);
    req.onsuccess = req.onerror = req.onblocked = () => ok();
  });
});

const fila = async () => (await abrirBanco()).getAll('fila_sync');

describe('repositório local', () => {
  it('cria a lista "Geral" uma única vez', async () => {
    await garantirDadosIniciais();
    await garantirDadosIniciais();
    const listas = await listarTodos('listas');
    expect(listas.map((l) => l.id)).toEqual([LISTA_PADRAO_ID]);
  });

  it('grava e coloca na fila como "criar"', async () => {
    await salvar('tarefas', novaTarefa({ id: 'a', lista_id: 'geral', titulo: 'Comprar pão' }));
    const itens = await fila();
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ entidade: 'tarefas', registro_id: 'a', operacao: 'criar' });
  });

  it('compacta alterações seguidas do mesmo registro e mantém "criar" enquanto não sincronizar', async () => {
    const t = novaTarefa({ id: 'a', lista_id: 'geral', titulo: 'v1' });
    await salvar('tarefas', t);
    await salvar('tarefas', { ...t, titulo: 'v2' });
    await gravar([{ entidade: 'tarefas', registro: { ...t, titulo: 'v3', status: 'excluida' }, operacao: 'excluir' }]);
    const itens = await fila();
    expect(itens).toHaveLength(1);
    expect(itens[0].operacao).toBe('criar');
    expect((itens[0].payload as unknown as { titulo: string }).titulo).toBe('v3');
  });

  it('preserva criado_em e atualiza atualizado_em; devolve a versão anterior', async () => {
    const t = novaTarefa({ id: 'a', lista_id: 'geral', titulo: 'v1' }, new Date('2026-01-01T10:00:00Z'));
    await salvar('tarefas', t);
    const anterior = await salvar('tarefas', { ...t, titulo: 'v2', criado_em: 'lixo' });
    expect(anterior?.titulo).toBe('v1');
    const [salvo] = await listarTodos('tarefas');
    expect(salvo.criado_em).toBe(t.criado_em);
    expect(salvo.atualizado_em).not.toBe(t.atualizado_em);
  });

  it('grava várias entidades numa transação só', async () => {
    await gravar([
      { entidade: 'tarefas', registro: novaTarefa({ id: 'a', lista_id: 'geral', titulo: 'a' }) },
      { entidade: 'tarefas', registro: novaTarefa({ id: 'b', lista_id: 'geral', titulo: 'b' }) },
    ]);
    expect(await listarTodos('tarefas')).toHaveLength(2);
    expect(await fila()).toHaveLength(2);
  });
});
