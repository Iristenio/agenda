// Testa o ciclo completo app ↔ backend usando o MESMO núcleo do Apps Script (backend/nucleo.js),
// com a planilha simulada em memória.
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, fecharBanco, NOME_BANCO } from '../dados/db';
import { buscar, listarFila, salvar, salvarInterno } from '../dados/repositorio';
import { novaTarefa } from '../dominio/tarefas';
import { baixarTudo, decodificarCodigo, lerEstadoSync, sincronizar } from './motor';

const require = createRequire(import.meta.url);
const nucleo = require('../../../backend/nucleo.js');

const TOKEN = 'segredo';
let tabelas: Record<string, ReturnType<typeof nucleo.tabelaEmMemoria>>;
let relogio = 0;
const agoraServidor = () => new Date(Date.UTC(2026, 8, 24, 12, 0, relogio++)).toISOString();

/** Servidor falso: mesma lógica do doPost (token + processar). */
function instalarServidor() {
  tabelas = Object.fromEntries(Object.keys(nucleo.ESQUEMA).map((e) => [e, nucleo.tabelaEmMemoria()]));
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const req = JSON.parse(String(init.body));
    const corpo = req.token !== TOKEN ? { ok: false, erro: 'Token inválido', codigo: 401 } : nucleo.processar(tabelas, req, agoraServidor());
    return { ok: true, status: 200, json: async () => corpo } as Response;
  });
}

/** Simula outro aparelho enviando uma alteração direto ao servidor. */
function outroAparelhoEnvia(entidade: string, payload: object) {
  const p = payload as { id: string };
  nucleo.processar(tabelas, { acao: 'sincronizar', operacoes: [{ id: 'x' + p.id, entidade, registro_id: p.id, operacao: 'alterar', payload }] }, agoraServidor());
}

beforeEach(async () => {
  await fecharBanco();
  await new Promise<void>((ok) => {
    const req = indexedDB.deleteDatabase(NOME_BANCO);
    req.onsuccess = req.onerror = req.onblocked = () => ok();
  });
  instalarServidor();
  await salvarInterno('_conexao', { url: 'https://exemplo/exec', token: TOKEN });
});

const tarefa = (id: string, titulo: string, atualizado = '2026-09-24T10:00:00.000Z') =>
  ({ ...novaTarefa({ id, lista_id: 'geral', titulo }), atualizado_em: atualizado, criado_em: atualizado });

describe('código de conexão', () => {
  it('decodifica o formato AGENDA1', () => {
    const b64 = btoa(JSON.stringify({ u: 'https://script.google.com/macros/s/x/exec', t: 'abc' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(decodificarCodigo(`  AGENDA1:${b64} `)).toEqual({ url: 'https://script.google.com/macros/s/x/exec', token: 'abc' });
    expect(decodificarCodigo('qualquer coisa')).toBeNull();
    expect(decodificarCodigo('AGENDA1:@@@')).toBeNull();
  });
});

describe('núcleo do backend', () => {
  it('linha ↔ registro preserva tipos (nulos, números, sim/não, listas)', () => {
    const reg = { ...tarefa('a', 'x'), prazo: null, ordem: 12.5, sync_google: false };
    const linha = nucleo.registroParaLinha('tarefas', reg, 'T');
    expect(nucleo.linhaParaRegistro('tarefas', linha)).toEqual(reg);
    const comp = { excecoes: ['2026-09-01'], lembretes: [10, 60] };
    const l2 = nucleo.registroParaLinha('compromissos', { id: 'c', ...comp }, 'T');
    expect(nucleo.linhaParaRegistro('compromissos', l2)).toMatchObject(comp);
  });

  it('versão antiga não sobrescreve a mais nova', () => {
    outroAparelhoEnvia('tarefas', tarefa('a', 'nova', '2026-09-24T12:00:00.000Z'));
    outroAparelhoEnvia('tarefas', tarefa('a', 'velha', '2026-09-24T09:00:00.000Z'));
    const [linha] = tabelas.tarefas.linhas();
    expect(linha[1]).toBe('nova');
  });
});

describe('sincronização', () => {
  it('envia a fila local e a esvazia', async () => {
    await salvar('tarefas', tarefa('t1', 'Pagar luz'));
    expect(await listarFila()).toHaveLength(1);
    await sincronizar();
    expect(await listarFila()).toHaveLength(0);
    expect(tabelas.tarefas.linhas().map((l: string[]) => l[1])).toEqual(['Pagar luz']);
    expect(lerEstadoSync().status).toBe('sincronizado');
  });

  it('recebe o que outro aparelho enviou', async () => {
    outroAparelhoEnvia('tarefas', tarefa('t9', 'Criada no celular'));
    await sincronizar();
    expect((await buscar('tarefas', 't9'))?.titulo).toBe('Criada no celular');
    expect(await listarFila()).toHaveLength(0); // o que veio de fora não volta para a fila
  });

  it('depois do primeiro ciclo, só baixa o que mudou (cursor)', async () => {
    outroAparelhoEnvia('tarefas', tarefa('t1', 'v1'));
    await sincronizar();
    const chamadas: string[] = [];
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      const r = await original(u, init);
      const corpo = await r.json();
      chamadas.push(JSON.stringify(corpo.dados.tarefas.map((t: { titulo: string }) => t.titulo)));
      return { ok: true, status: 200, json: async () => corpo } as Response;
    });
    outroAparelhoEnvia('tarefas', tarefa('t2', 'v2'));
    await sincronizar();
    expect(chamadas).toEqual(['["v2"]']);
  });

  it('alteração local ainda não enviada não é sobrescrita; depois vence a mais recente', async () => {
    await salvar('tarefas', tarefa('t1', 'local'));
    const local = await buscar('tarefas', 't1'); // atualizado_em = agora (mais recente)
    outroAparelhoEnvia('tarefas', tarefa('t1', 'remota antiga', '2026-01-01T00:00:00.000Z'));
    await sincronizar();
    expect((await buscar('tarefas', 't1'))?.titulo).toBe('local');
    expect(tabelas.tarefas.linhas()[0][1]).toBe('local');
    expect(local).toBeDefined();
  });

  it('token inválido vira erro e mantém a fila', async () => {
    await salvarInterno('_conexao', { url: 'https://exemplo/exec', token: 'errado' });
    await salvar('tarefas', tarefa('t1', 'x'));
    await sincronizar();
    expect(lerEstadoSync().status).toBe('erro');
    expect(lerEstadoSync().erro).toMatch(/código de conexão/);
    expect(await listarFila()).toHaveLength(1);
  });

  it('envia em lotes quando há muitas alterações', async () => {
    for (let i = 0; i < 120; i++) await salvar('tarefas', tarefa(`t${i}`, `tarefa ${i}`));
    await sincronizar();
    expect(await listarFila()).toHaveLength(0);
    expect(tabelas.tarefas.linhas()).toHaveLength(120);
  });

  it('"baixar tudo" restaura um aparelho vazio', async () => {
    outroAparelhoEnvia('tarefas', tarefa('t1', 'a'));
    outroAparelhoEnvia('listas', { id: 'geral', nome: 'Geral', cor: '#000', ordem: 0, ativo: true, google_tasklist_id: null, criado_em: 'x', atualizado_em: 'x' });
    await sincronizar();
    const db = await abrirBanco();
    await db.clear('tarefas');
    await baixarTudo();
    expect((await buscar('tarefas', 't1'))?.titulo).toBe('a');
  });
});
