// Regras de negócio dos compromissos (RN10–RN17).
//
// Datas dos compromissos: "AAAA-MM-DDTHH:mm" (hora local).
// Dia inteiro: início "D1T00:00" e fim "D2T23:59" (D2 = último dia, inclusivo).
//
// Séries recorrentes:
//  • O registro "mestre" guarda a regra (rrule) e as datas excluídas (excecoes, "AAAA-MM-DD").
//  • Uma ocorrência alterada sozinha vira um registro próprio com serie_id + ocorrencia_original.
//  • As ocorrências são identificadas pela DATA original (uma por dia, no máximo).
import type { Compromisso, Id } from './tipos';
import { diferencaMinutos, somarDias, somarMinutos } from './datas';
import { deRRule, ocorrenciasEntre, paraRRule, type Recorrencia } from './recorrencia';

export interface Ocorrencia {
  /** Registro exibido: o mestre (ocorrência normal) ou o registro de exceção. */
  compromisso: Compromisso;
  /** Mestre da série, quando a ocorrência pertence a uma série. */
  serie: Compromisso | null;
  inicio: string;
  fim: string;
  /** Data original na série ("AAAA-MM-DD") — identifica a ocorrência. */
  data_original: string | null;
  chave: string;
}

export function novoCompromisso(campos: Partial<Compromisso> & { id: Id; inicio: string; fim: string }, agora = new Date()): Compromisso {
  const carimbo = agora.toISOString();
  return {
    titulo: '',
    descricao: '',
    local: '',
    dia_inteiro: false,
    categoria_id: null,
    rrule: null,
    serie_id: null,
    ocorrencia_original: null,
    excecoes: [],
    lembretes: [10],
    sync_google: true,
    google_event_id: null,
    status: 'ativo',
    criado_em: carimbo,
    atualizado_em: carimbo,
    ...campos,
  };
}

/** RN10/RN11 — lista de erros (vazia = válido). */
export function validarCompromisso(c: Pick<Compromisso, 'titulo' | 'inicio' | 'fim' | 'dia_inteiro'>): string[] {
  const erros: string[] = [];
  if (!c.titulo.trim()) erros.push('Informe o título do compromisso.');
  if (!c.inicio) erros.push('Informe a data de início.');
  else if (c.dia_inteiro ? c.fim.slice(0, 10) < c.inicio.slice(0, 10) : c.fim <= c.inicio)
    erros.push(c.dia_inteiro ? 'A data final não pode ser antes da inicial.' : 'O término precisa ser depois do início.');
  return erros;
}

/** Normaliza as horas de um compromisso de dia inteiro. */
export function normalizarDiaInteiro<T extends Pick<Compromisso, 'inicio' | 'fim' | 'dia_inteiro'>>(c: T): T {
  if (!c.dia_inteiro) return c;
  return { ...c, inicio: `${c.inicio.slice(0, 10)}T00:00`, fim: `${c.fim.slice(0, 10)}T23:59` };
}

/* ---------------- Expansão das ocorrências num período ---------------- */

const sobrepoe = (inicio: string, fim: string, de: string, ate: string) => inicio < ate && fim > de;

/** Todas as ocorrências visíveis entre duas datas (inclusivas), ordenadas por início. */
export function expandirOcorrencias(todos: Compromisso[], de: string, ate: string): Ocorrencia[] {
  const inicioJanela = `${de}T00:00`;
  const fimJanela = `${somarDias(ate, 1)}T00:00`;

  // Datas de ocorrências substituídas por registros de exceção (qualquer status)
  const substituidas = new Map<Id, Set<string>>();
  const mestres = new Map<Id, Compromisso>();
  for (const c of todos) {
    if (c.serie_id && c.ocorrencia_original) {
      if (!substituidas.has(c.serie_id)) substituidas.set(c.serie_id, new Set());
      substituidas.get(c.serie_id)!.add(c.ocorrencia_original.slice(0, 10));
    }
    if (c.rrule) mestres.set(c.id, c);
  }

  const resultado: Ocorrencia[] = [];
  for (const c of todos) {
    if (c.status !== 'ativo') continue;

    if (!c.rrule) {
      if (sobrepoe(c.inicio, c.fim, inicioJanela, fimJanela)) {
        const serie = c.serie_id ? (mestres.get(c.serie_id) ?? null) : null;
        const data_original = c.ocorrencia_original?.slice(0, 10) ?? null;
        resultado.push({ compromisso: c, serie, inicio: c.inicio, fim: c.fim, data_original, chave: c.id });
      }
      continue;
    }

    const duracao = diferencaMinutos(c.inicio, c.fim);
    const recuo = Math.ceil(duracao / 1440) + 1; // ocorrências que começaram antes e ainda duram
    const ignorar = new Set([...c.excecoes, ...(substituidas.get(c.id) ?? [])]);
    for (const inicio of ocorrenciasEntre(c.rrule, somarDias(de, -recuo), ate)) {
      const data = inicio.slice(0, 10);
      if (ignorar.has(data)) continue;
      const fim = somarMinutos(inicio, duracao);
      if (!sobrepoe(inicio, fim, inicioJanela, fimJanela)) continue;
      resultado.push({ compromisso: c, serie: c, inicio, fim, data_original: data, chave: `${c.id}@${data}` });
    }
  }

  return resultado.sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim));
}

/** Ocorrências que tocam um dia específico. */
export function ocorrenciasDoDia(ocorrencias: Ocorrencia[], dia: string): Ocorrencia[] {
  return ocorrencias.filter((o) => sobrepoe(o.inicio, o.fim, `${dia}T00:00`, `${somarDias(dia, 1)}T00:00`));
}

/* ---------------- Conflitos (RN12) ---------------- */

/** Compromissos com horário que se sobrepõem ao intervalo (dia inteiro não conta). */
export function conflitos(
  alvo: { inicio: string; fim: string; dia_inteiro: boolean; chave?: string },
  ocorrencias: Ocorrencia[],
): Ocorrencia[] {
  if (alvo.dia_inteiro) return [];
  return ocorrencias.filter(
    (o) => !o.compromisso.dia_inteiro && o.chave !== alvo.chave && sobrepoe(o.inicio, o.fim, alvo.inicio, alvo.fim),
  );
}

/* ---------------- Alterações em séries (RN15) ---------------- */

export type Escopo = 'esta' | 'seguintes' | 'todas';

/** "Só esta" — cria (ou atualiza) o registro de exceção para uma ocorrência. */
export function alterarSoEsta(serie: Compromisso, dataOriginal: string, editado: Compromisso, novoId: () => Id): Compromisso {
  const jaExcecao = editado.serie_id === serie.id && editado.id !== serie.id;
  return {
    ...editado,
    id: jaExcecao ? editado.id : novoId(),
    rrule: null,
    excecoes: [],
    serie_id: serie.id,
    ocorrencia_original: `${dataOriginal}T${serie.inicio.slice(11, 16)}`,
    google_event_id: jaExcecao ? editado.google_event_id : null,
  };
}

/** "Só esta" (exclusão) — marca a data como excluída na série. */
export function excluirSoEsta(serie: Compromisso, dataOriginal: string): Compromisso {
  return { ...serie, excecoes: [...new Set([...serie.excecoes, dataOriginal])].sort() };
}

/** Encerra a série na véspera da data (término por data). */
function encerrarAntes(serie: Compromisso, data: string): Compromisso {
  const rec = deRRule(serie.rrule!);
  const encerrada: Recorrencia = { ...rec, fim: 'data', ate: somarDias(data, -1), contagem: null };
  return {
    ...serie,
    rrule: paraRRule(encerrada, serie.inicio),
    excecoes: serie.excecoes.filter((d) => d < data),
  };
}

/** Exceções da série a partir de uma data deixam de valer (viram excluídas). */
function descartarExcecoesDesde(excecoesSerie: Compromisso[], data: string): Compromisso[] {
  return excecoesSerie
    .filter((e) => e.status !== 'excluido' && (e.ocorrencia_original ?? '').slice(0, 10) >= data)
    .map((e) => ({ ...e, status: 'excluido' as const }));
}

/**
 * "Esta e as seguintes" — encerra a série original na véspera e cria uma nova série
 * a partir desta ocorrência com os dados editados. Retorna todos os registros a gravar.
 */
export function alterarSeguintes(
  serie: Compromisso,
  dataOriginal: string,
  editado: Compromisso,
  rec: Recorrencia | null,
  excecoesSerie: Compromisso[],
  novoId: () => Id,
): Compromisso[] {
  // Na primeira ocorrência, "esta e as seguintes" é o mesmo que "todas"
  if (dataOriginal <= serie.inicio.slice(0, 10)) return alterarTodas(serie, serie.inicio, editado, rec, excecoesSerie);
  const recOriginal = deRRule(serie.rrule!);
  let recNova = rec;
  if (recNova && recNova.fim === 'contagem' && recOriginal.fim === 'contagem' && recNova.contagem === recOriginal.contagem) {
    // Mantém o total da série original: a nova série fica só com as ocorrências restantes
    const anteriores = ocorrenciasEntre(serie.rrule!, serie.inicio.slice(0, 10), somarDias(dataOriginal, -1)).length;
    recNova = { ...recNova, contagem: Math.max(1, (recOriginal.contagem ?? 1) - anteriores) };
  }

  const nova: Compromisso = {
    ...editado,
    id: novoId(),
    rrule: recNova ? paraRRule(recNova, editado.inicio) : null,
    excecoes: serie.excecoes.filter((d) => d > dataOriginal),
    serie_id: null,
    ocorrencia_original: null,
    google_event_id: null,
  };
  return [encerrarAntes(serie, dataOriginal), nova, ...descartarExcecoesDesde(excecoesSerie, dataOriginal)];
}

/** "Esta e as seguintes" (exclusão). Se for a primeira ocorrência, exclui a série inteira. */
export function excluirSeguintes(serie: Compromisso, dataOriginal: string, excecoesSerie: Compromisso[]): Compromisso[] {
  if (dataOriginal <= serie.inicio.slice(0, 10)) return excluirTodas(serie, excecoesSerie);
  return [encerrarAntes(serie, dataOriginal), ...descartarExcecoesDesde(excecoesSerie, dataOriginal)];
}

/**
 * "Todas" — aplica a edição à série inteira. Mudanças de data/hora feitas na ocorrência
 * são aplicadas como deslocamento sobre o início da série.
 */
export function alterarTodas(
  serie: Compromisso,
  inicioOcorrencia: string,
  editado: Compromisso,
  rec: Recorrencia | null,
  excecoesSerie: Compromisso[],
): Compromisso[] {
  if (!rec) {
    // Deixou de repetir: vira um compromisso único nesta data; exceções deixam de valer
    const unico: Compromisso = { ...editado, id: serie.id, rrule: null, excecoes: [], serie_id: null, ocorrencia_original: null, google_event_id: serie.google_event_id };
    return [unico, ...descartarExcecoesDesde(excecoesSerie, '0000-00-00')];
  }
  const deslocamento = diferencaMinutos(inicioOcorrencia, editado.inicio);
  const inicio = somarMinutos(serie.inicio, deslocamento);
  const fim = somarMinutos(inicio, diferencaMinutos(editado.inicio, editado.fim));
  const atualizada: Compromisso = {
    ...editado,
    id: serie.id,
    inicio,
    fim,
    rrule: paraRRule(rec, inicio),
    excecoes: serie.excecoes,
    serie_id: null,
    ocorrencia_original: null,
    google_event_id: serie.google_event_id,
    criado_em: serie.criado_em,
  };
  return [atualizada];
}

/** "Todas" (exclusão) — série e exceções excluídas. */
export function excluirTodas(serie: Compromisso, excecoesSerie: Compromisso[]): Compromisso[] {
  return [{ ...serie, status: 'excluido' }, ...descartarExcecoesDesde(excecoesSerie, '0000-00-00')];
}

/* ---------------- Disposição visual de um dia (colunas lado a lado) ---------------- */

export interface Posicionada<T> {
  item: T;
  coluna: number;
  colunas: number;
}

/**
 * Distribui eventos sobrepostos em colunas (como no Google Agenda).
 * Eventos que se sobrepõem formam um grupo; cada grupo divide a largura igualmente.
 */
export function organizarColunas<T extends { inicio: string; fim: string }>(itens: T[]): Posicionada<T>[] {
  const ordenados = [...itens].sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim));
  const resultado: Posicionada<T>[] = [];
  let grupo: Posicionada<T>[] = [];
  let fimGrupo = '';
  let colunasFim: string[] = [];

  const fecharGrupo = () => {
    grupo.forEach((p) => (p.colunas = colunasFim.length));
    resultado.push(...grupo);
    grupo = [];
    colunasFim = [];
  };

  for (const item of ordenados) {
    if (grupo.length && item.inicio >= fimGrupo) fecharGrupo();
    let coluna = colunasFim.findIndex((fim) => fim <= item.inicio);
    if (coluna === -1) {
      coluna = colunasFim.length;
      colunasFim.push(item.fim);
    } else {
      colunasFim[coluna] = item.fim;
    }
    grupo.push({ item, coluna, colunas: 0 });
    fimGrupo = grupo.length === 1 ? item.fim : item.fim > fimGrupo ? item.fim : fimGrupo;
  }
  if (grupo.length) fecharGrupo();
  return resultado;
}
