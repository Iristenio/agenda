// Feriados unificados (RN42–RN46): feriados = (agendas do Google marcadas + cadastrados no app) − os "não é folga".
//
// O resultado é um Mapa "AAAA-MM-DD" → nome, usado em: dias úteis das tarefas recorrentes,
// contagem de dias úteis das férias, destaque no calendário e alerta nos compromissos.
import type { Externo, Feriado } from './tipos';
import { diaDaSemana, somarDias } from './datas';

export type MapaFeriados = Map<string, string>;

/** Compara nomes ignorando maiúsculas, acentos e espaços extras ("Dia das Mães" = "dia das maes"). */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function validarFeriado(f: Pick<Feriado, 'nome' | 'data' | 'tipo'>): string[] {
  const erros: string[] = [];
  if (!f.nome.trim()) erros.push('Informe o nome do feriado.');
  if (f.tipo === 'folga' && !f.data) erros.push('Informe a data.');
  return erros;
}

/** Nomes (normalizados) de feriados do Google que o usuário marcou como "não é folga". */
export function nomesIgnorados(feriados: Feriado[]): Set<string> {
  return new Set(feriados.filter((f) => f.status === 'ativo' && f.tipo === 'nao_folga').map((f) => normalizarNome(f.nome)));
}

/** Um evento do Google conta como feriado? (agenda marcada, dia inteiro e não ignorado) */
export function externoEhFeriado(e: Externo, agendasFeriado: Set<string>, ignorados: Set<string>): boolean {
  return agendasFeriado.has(e.agenda_id) && e.dia_inteiro && !ignorados.has(normalizarNome(e.titulo));
}

/**
 * Monta o mapa de feriados entre duas datas (inclusivas).
 * Feriados cadastrados têm prioridade no nome quando caem no mesmo dia de um do Google.
 */
export function montarFeriados(feriados: Feriado[], externos: Externo[], agendasFeriado: Set<string>, de: string, ate: string): MapaFeriados {
  const mapa: MapaFeriados = new Map();
  const ignorados = nomesIgnorados(feriados);

  for (const e of externos) {
    if (!externoEhFeriado(e, agendasFeriado, ignorados)) continue;
    for (let d = e.inicio.slice(0, 10); d <= e.fim.slice(0, 10); d = somarDias(d, 1)) {
      if (d >= de && d <= ate && !mapa.has(d)) mapa.set(d, e.titulo);
    }
  }

  const anoIni = Number(de.slice(0, 4));
  const anoFim = Number(ate.slice(0, 4));
  for (const f of feriados) {
    if (f.status !== 'ativo' || f.tipo !== 'folga' || !f.data) continue;
    const datas = f.anual
      ? Array.from({ length: anoFim - anoIni + 1 }, (_, i) => `${anoIni + i}${f.data!.slice(4)}`)
      : [f.data];
    for (const d of datas) if (d >= de && d <= ate) mapa.set(d, f.nome);
  }
  return mapa;
}

/** Dia útil = segunda a sexta que não é feriado. */
export function ehDiaUtil(data: string, feriados: MapaFeriados = new Map()): boolean {
  const s = diaDaSemana(data);
  return s !== 0 && s !== 6 && !feriados.has(data);
}

/** Primeiro ou último dia útil do mês de `data` (considerando feriados). */
export function diaUtilDoMes(data: string, qual: 'primeiro_util' | 'ultimo_util', feriados: MapaFeriados = new Map()): string {
  const mes = data.slice(0, 7);
  if (qual === 'primeiro_util') {
    for (let d = `${mes}-01`; d.slice(0, 7) === mes; d = somarDias(d, 1)) if (ehDiaUtil(d, feriados)) return d;
  } else {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
    for (let d = ultimo; d.slice(0, 7) === mes; d = somarDias(d, -1)) if (ehDiaUtil(d, feriados)) return d;
  }
  return data; // mês inteiro sem dia útil (não acontece na prática)
}

/** Dias úteis entre duas datas (inclusivas), descontando feriados. */
export function contarDiasUteis(ini: string, fim: string, feriados: MapaFeriados = new Map()): number {
  let total = 0;
  for (let d = ini; d <= fim; d = somarDias(d, 1)) if (ehDiaUtil(d, feriados)) total++;
  return total;
}

/** Feriados (data + nome) dentro de um período, em ordem. */
export function feriadosNoPeriodo(feriados: MapaFeriados, de: string, ate: string): { data: string; nome: string }[] {
  return [...feriados.entries()]
    .filter(([d]) => d >= de && d <= ate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, nome]) => ({ data, nome }));
}
