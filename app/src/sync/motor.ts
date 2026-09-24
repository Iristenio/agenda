// Motor de sincronização (RS01–RS11).
//
// Um ciclo = uma ou mais chamadas "sincronizar" ao backend. Cada chamada:
//   1) envia um lote da fila local (até 50 alterações);
//   2) recebe tudo o que o servidor recebeu depois do último cursor (de qualquer aparelho).
import type { Entidade, ItemFila, Registro, Tarefa } from '../dominio/tipos';
import { concluirTarefa } from '../dominio/tarefas';
import {
  aoGravarLocal,
  aplicarRemotos,
  buscar,
  confirmarEnvio,
  gravar,
  lerInterno,
  listarFila,
  registrarFalhas,
  salvarInterno,
} from '../dados/repositorio';

export interface Conexao {
  url: string;
  token: string;
  planilha?: string;
}

export type StatusSync = 'desconectado' | 'offline' | 'sincronizando' | 'sincronizado' | 'pendente' | 'erro';

export interface EstadoSync {
  status: StatusSync;
  pendentes: number;
  ultimaSync: string | null;
  erro: string | null;
  planilha: string | null;
  /** Envio ao Google Agenda (feito pelo servidor): pendências e erros. */
  google: ResumoGoogle | null;
}

export interface ResumoGoogle {
  pendentes: number;
  erros: number;
  ultimoErro: string;
}

const TAMANHO_LOTE = 50;
const INTERVALO_MS = 5 * 60_000;
const ESPERA_ENVIO_MS = 2_500;
const FALHAS_PARA_ERRO = 5;

/* ---------------- Código de conexão ---------------- */

/** "AGENDA1:<base64url de {u, t}>" → conexão. */
export function decodificarCodigo(codigo: string): Conexao | null {
  const limpo = codigo.trim().replace(/\s+/g, '');
  if (!limpo.startsWith('AGENDA1:')) return null;
  try {
    const b64 = limpo.slice(8).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    // http://localhost só é aceito para testes com o servidor falso
    const urlValida = typeof json.u === 'string' && (json.u.startsWith('https://') || json.u.startsWith('http://localhost:'));
    if (!urlValida || typeof json.t !== 'string') return null;
    return { url: json.u, token: json.t };
  } catch {
    return null;
  }
}

/* ---------------- Estado observável ---------------- */

let estado: EstadoSync = { status: 'desconectado', pendentes: 0, ultimaSync: null, erro: null, planilha: null, google: null };
const ouvintes = new Set<(e: EstadoSync) => void>();

export const lerEstadoSync = () => estado;

export function aoMudarSync(fn: (e: EstadoSync) => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function definir(parcial: Partial<EstadoSync>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((fn) => fn(estado));
}

/* ---------------- Chamada ao backend ---------------- */

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: number,
  ) {
    super(mensagem);
  }
}

interface RespostaSync {
  ok: boolean;
  erro?: string;
  codigo?: number;
  resultados?: { id: string; ok: boolean; erro?: string; ignorado?: boolean }[];
  dados?: Partial<Record<Entidade, Registro[]>>;
  cursor?: string;
  planilha?: string;
  versao?: number;
  google?: ResumoGoogle;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const TENTATIVAS = 4;

/** Uma tentativa; devolve a resposta do backend ou lança um erro com a causa. */
async function tentar(conexao: Conexao, corpo: object): Promise<RespostaSync> {
  let resposta: Response;
  try {
    // text/plain evita a verificação prévia (CORS) que o Apps Script não suporta
    resposta = await fetch(conexao.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...corpo, token: conexao.token }),
      redirect: 'follow',
      credentials: 'omit',
    });
  } catch {
    throw new Error(semInternet() ? 'Sem internet' : 'O servidor do Google não respondeu');
  }
  if (!resposta.ok) throw new Error(`O servidor do Google respondeu com erro ${resposta.status}`);
  try {
    return await resposta.json();
  } catch {
    throw new Error('O Google devolveu uma página de erro em vez da resposta');
  }
}

/**
 * Chama o backend. O Google às vezes falha de forma passageira (página de erro, lentidão),
 * então tenta algumas vezes com espera crescente. Reenviar é seguro: o servidor ignora
 * versões repetidas ou mais antigas.
 */
async function chamar(conexao: Conexao, corpo: object): Promise<RespostaSync> {
  let ultimoErro = '';
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const json = await tentar(conexao, corpo);
      // Resposta válida do backend: erros dele (ex.: token inválido) não adianta repetir
      if (!json.ok) throw new ErroApi(json.erro ?? 'Erro no servidor', json.codigo);
      return json;
    } catch (e) {
      if (e instanceof ErroApi) throw e;
      ultimoErro = e instanceof Error ? e.message : String(e);
      if (semInternet()) break;
      if (tentativa < TENTATIVAS) await esperar(1500 * tentativa);
    }
  }
  throw new ErroApi(`${ultimoErro}. O app tentará de novo sozinho em instantes.`);
}

/* ---------------- Conectar / desconectar ---------------- */

/** Testa o código de conexão e, se funcionar, guarda e dispara a primeira sincronização. */
export async function conectar(codigo: string): Promise<void> {
  const conexao = decodificarCodigo(codigo);
  if (!conexao) throw new ErroApi('Código de conexão inválido. Ele começa com "AGENDA1:".');
  if (/\/dev\/?$/.test(conexao.url)) {
    throw new ErroApi('Este código aponta para o endereço de teste do Apps Script (/dev), que exige login. Execute configurar() de novo para gerar um código com o endereço público.');
  }
  const r = await chamar(conexao, { acao: 'ping' });
  await salvarInterno('_conexao', { ...conexao, planilha: r.planilha });
  await salvarInterno('_cursor', undefined);
  definir({ planilha: r.planilha ?? null, erro: null });
  await sincronizar();
}

export async function desconectar() {
  await salvarInterno('_conexao', undefined);
  await salvarInterno('_cursor', undefined);
  definir({ planilha: null, erro: null });
  await atualizarStatus();
}

/** Baixa novamente tudo da planilha (mescla com o que há no aparelho). */
export async function baixarTudo() {
  await salvarInterno('_cursor', undefined);
  await sincronizar();
}

/* ---------------- Ciclo de sincronização ---------------- */

let rodando: Promise<void> | null = null;
let repetir = false;
let falhasSeguidas = 0;
let timerRetentativa: ReturnType<typeof setTimeout> | undefined;

const semInternet = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function atualizarStatus(erro: string | null = estado.erro) {
  const conexao = await lerInterno<Conexao>('_conexao');
  const fila = await listarFila();
  const travados = fila.some((i) => i.tentativas >= FALHAS_PARA_ERRO);
  const status: StatusSync = !conexao
    ? 'desconectado'
    : semInternet()
      ? 'offline'
      : erro || travados
        ? 'erro'
        : fila.length
          ? 'pendente'
          : 'sincronizado';
  definir({ status, pendentes: fila.length, erro, planilha: conexao?.planilha ?? null });
}

/** Executa um ciclo completo. Chamadas simultâneas são agrupadas. */
export function sincronizar(): Promise<void> {
  if (rodando) {
    repetir = true;
    return rodando;
  }
  rodando = (async () => {
    try {
      do {
        repetir = false;
        await ciclo();
      } while (repetir);
    } finally {
      rodando = null;
    }
  })();
  return rodando;
}

async function ciclo() {
  clearTimeout(timerRetentativa);
  const conexao = await lerInterno<Conexao>('_conexao');
  if (!conexao || semInternet()) return atualizarStatus(null);

  definir({ status: 'sincronizando' });
  try {
    let fila = await listarFila();
    let voltas = 0;
    do {
      const lote = fila.slice(0, TAMANHO_LOTE);
      const cursor = (await lerInterno<string>('_cursor')) ?? null;
      const r = await chamar(conexao, {
        acao: 'sincronizar',
        cursor,
        operacoes: lote.map((i) => ({ id: i.id, entidade: i.entidade, registro_id: i.registro_id, operacao: i.operacao, payload: i.payload })),
      });

      const porId = new Map(lote.map((i) => [i.id, i]));
      const sucessos: ItemFila[] = [];
      const falhas: { item: ItemFila; erro: string }[] = [];
      for (const res of r.resultados ?? []) {
        const item = porId.get(res.id);
        if (!item) continue;
        if (res.ok) sucessos.push(item);
        else falhas.push({ item, erro: res.erro ?? 'erro' });
      }
      await confirmarEnvio(sucessos);
      if (falhas.length) await registrarFalhas(falhas);
      await aplicarRemotos(r.dados ?? {});
      const geradas = await gerarProximasRecorrentes((r.dados?.tarefas ?? []) as Tarefa[]);
      if (r.cursor) await salvarInterno('_cursor', r.cursor);
      if (r.google) definir({ google: r.google });

      fila = await listarFila();
      voltas++;
      // Continua enquanto houver mais itens do que cabem num lote (com progresso) ou itens recém-gerados
      if (!((lote.length === TAMANHO_LOTE && sucessos.length > 0) || geradas > 0)) break;
    } while (fila.length && voltas < 50);

    falhasSeguidas = 0;
    const agora = new Date().toISOString();
    await salvarInterno('_ultima_sync', agora);
    definir({ ultimaSync: agora });
    await atualizarStatus(null);
  } catch (e) {
    falhasSeguidas++;
    const msg = e instanceof ErroApi && e.codigo === 401 ? 'O código de conexão não é mais válido — conecte de novo.' : e instanceof Error ? e.message : String(e);
    await atualizarStatus(semInternet() ? null : msg);
    // RS06 — nova tentativa com intervalo crescente (5 s, 15 s, 45 s… até 5 min)
    const espera = Math.min(INTERVALO_MS, 5_000 * 3 ** (falhasSeguidas - 1));
    timerRetentativa = setTimeout(() => sincronizar(), espera);
  }
}

/**
 * RT06 — tarefa recorrente concluída fora deste aparelho (ex.: no Google Tasks) ainda sem a
 * próxima ocorrência: gera a próxima aqui. O id é previsível ("<id>~prox") para que dois
 * aparelhos fazendo isso ao mesmo tempo gravem a MESMA tarefa, sem duplicar.
 */
async function gerarProximasRecorrentes(recebidas: Tarefa[]): Promise<number> {
  let geradas = 0;
  for (const r of recebidas) {
    if (r.status !== 'concluida' || !r.rrule || !r.prazo || r.proxima_gerada_id) continue;
    const local = await buscar('tarefas', r.id);
    if (!local || local.status !== 'concluida' || local.proxima_gerada_id) continue;
    const { concluida, proxima } = concluirTarefa({ ...local, status: 'pendente' }, () => `${local.id}~prox`);
    if (!proxima) continue;
    await gravar([
      { entidade: 'tarefas', registro: { ...concluida, concluida_em: local.concluida_em } },
      { entidade: 'tarefas', registro: proxima },
    ]);
    geradas++;
  }
  return geradas;
}

/* ---------------- Início automático ---------------- */

let iniciado = false;

/** Liga os gatilhos: ao abrir, ao voltar a internet, ao voltar ao app, após gravações e a cada 5 min. */
export async function iniciarSincronizacao() {
  if (iniciado) return;
  iniciado = true;
  definir({ ultimaSync: (await lerInterno<string>('_ultima_sync')) ?? null });

  let timerEnvio: ReturnType<typeof setTimeout> | undefined;
  aoGravarLocal(() => {
    clearTimeout(timerEnvio);
    timerEnvio = setTimeout(() => sincronizar(), ESPERA_ENVIO_MS);
    void atualizarStatus();
  });
  window.addEventListener('online', () => sincronizar());
  window.addEventListener('offline', () => atualizarStatus(null));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sincronizar());
  setInterval(() => sincronizar(), INTERVALO_MS);
  await sincronizar();
}
