// Férias e outros períodos (RN13, RN34–RN37).
import type { Evento, Id, Pessoa, TipoEvento } from './tipos';
import { diaDaSemana, diferencaDias, somarDias } from './datas';
import { nomeExibicao } from './pessoas';

export const TITULO_TIPO: Record<TipoEvento, string> = {
  ferias_pessoais: 'Minhas férias',
  ferias_equipe: 'Férias da equipe',
  outro: 'Outro período',
};

export function novoEvento(campos: Partial<Evento> & { id: Id; data_inicio: string; data_fim: string }, agora = new Date()): Evento {
  const carimbo = agora.toISOString();
  return {
    tipo: 'ferias_pessoais',
    titulo: '',
    pessoa_id: null,
    observacoes: '',
    sync_google: true,
    google_event_id: null,
    status: 'ativo',
    criado_em: carimbo,
    atualizado_em: carimbo,
    ...campos,
  };
}

/** Título exibido: o informado ou um automático ("Férias – Ana"). */
export function tituloEvento(e: Evento, pessoas: Map<Id, Pessoa>): string {
  if (e.titulo.trim()) return e.titulo.trim();
  if (e.tipo === 'ferias_pessoais') return 'Minhas férias';
  const p = e.pessoa_id ? pessoas.get(e.pessoa_id) : undefined;
  if (e.tipo === 'ferias_equipe') return p ? `Férias – ${nomeExibicao(p)}` : 'Férias';
  return p ? `${TITULO_TIPO.outro} – ${nomeExibicao(p)}` : TITULO_TIPO.outro;
}

export function validarEvento(e: Pick<Evento, 'tipo' | 'pessoa_id' | 'data_inicio' | 'data_fim' | 'titulo'>): string[] {
  const erros: string[] = [];
  if (!e.data_inicio || !e.data_fim) erros.push('Informe o período.');
  else if (e.data_fim < e.data_inicio) erros.push('A data final não pode ser antes da inicial.');
  if (e.tipo === 'ferias_equipe' && !e.pessoa_id) erros.push('Escolha a pessoa da equipe.');
  if (e.tipo === 'outro' && !e.titulo.trim()) erros.push('Dê um nome ao período.');
  return erros;
}

/* ---------------- Contagem de dias (RN34) ---------------- */

export const diasCorridos = (ini: string, fim: string) => diferencaDias(ini, fim) + 1;

/** Dias úteis (segunda a sexta), inclusivo. Feriados entram numa versão futura. */
export function diasUteis(ini: string, fim: string): number {
  let total = 0;
  for (let d = ini; d <= fim; d = somarDias(d, 1)) {
    const s = diaDaSemana(d);
    if (s !== 0 && s !== 6) total++;
  }
  return total;
}

/* ---------------- Ausências ---------------- */

const ehFerias = (e: Evento) => e.tipo === 'ferias_pessoais' || e.tipo === 'ferias_equipe';
const ativo = (e: Evento) => e.status === 'ativo';
const cobre = (e: Pick<Evento, 'data_inicio' | 'data_fim'>, ini: string, fim: string) => e.data_inicio <= fim && e.data_fim >= ini;

/** Chave de quem está ausente: a pessoa, ou "eu" nas férias pessoais. */
const ausente = (e: Evento) => (e.tipo === 'ferias_pessoais' ? 'eu' : (e.pessoa_id ?? e.id));

export function eventosEntre(eventos: Evento[], de: string, ate: string): Evento[] {
  return eventos.filter((e) => ativo(e) && cobre(e, de, ate)).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
}

/** Férias ativas no dia. */
export function feriasNoDia(eventos: Evento[], dia: string): Evento[] {
  return eventos.filter((e) => ativo(e) && ehFerias(e) && cobre(e, dia, dia));
}

/** RN35 — outros períodos de férias da mesma pessoa que se sobrepõem. */
export function sobreposicoesMesmaPessoa(alvo: Evento, eventos: Evento[]): Evento[] {
  if (!ehFerias(alvo)) return [];
  return eventos.filter(
    (e) => e.id !== alvo.id && ativo(e) && ehFerias(e) && ausente(e) === ausente(alvo) && cobre(e, alvo.data_inicio, alvo.data_fim),
  );
}

export interface DiaLotado {
  dia: string;
  ausentes: number;
}

/** RN36 — dias do período em que mais de `limite` pessoas estão de férias. */
export function diasAcimaDoLimite(eventos: Evento[], limite: number, de: string, ate: string): DiaLotado[] {
  const relevantes = eventos.filter((e) => ativo(e) && ehFerias(e) && cobre(e, de, ate));
  const resultado: DiaLotado[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const pessoas = new Set(relevantes.filter((e) => cobre(e, d, d)).map(ausente));
    if (pessoas.size > limite) resultado.push({ dia: d, ausentes: pessoas.size });
  }
  return resultado;
}

/** Agrupa dias consecutivos em intervalos (para mensagens como "10 a 14/10"). */
export function agruparDias(dias: string[]): { de: string; ate: string }[] {
  const grupos: { de: string; ate: string }[] = [];
  for (const d of [...dias].sort()) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && somarDias(ultimo.ate, 1) === d) ultimo.ate = d;
    else grupos.push({ de: d, ate: d });
  }
  return grupos;
}

/** RN13 — minhas férias que coincidem com um intervalo de datas. */
export function minhasFeriasEm(eventos: Evento[], de: string, ate: string): Evento[] {
  return eventos.filter((e) => ativo(e) && e.tipo === 'ferias_pessoais' && cobre(e, de, ate));
}
