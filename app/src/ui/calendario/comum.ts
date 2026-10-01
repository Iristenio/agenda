// Utilitários compartilhados pelas visões do calendário.
import { useMemo } from 'preact/hooks';
import type { Categoria, Evento, Pessoa, Tarefa } from '../../dominio/tipos';
import { expandirOcorrencias, externosComoOcorrencias, type Ocorrencia } from '../../dominio/compromissos';
import { aniversariosEntre, nomeExibicao, type Aniversario } from '../../dominio/pessoas';
import { eventosEntre, tituloEvento } from '../../dominio/ferias';
import { useAgendasExternas, useEntidade, useExternos, useFeriados } from '../../dados/ganchos';
import { idsAgendasFeriado } from '../../dados/feriados';
import { externoEhFeriado, nomesIgnorados, type MapaFeriados } from '../../dominio/feriados';
import type { Painel } from '../estado';

/** Cor de compromissos sem categoria (fixa: contrasta com texto branco nos dois temas). */
export const COR_PADRAO = '#2f6fed';
export const COR_EU = '#30a46c';
export const COR_OUTRO = '#697386';
export const COR_ANIVERSARIO = '#e54666';
export const COR_FERIADO = '#c2410c';

export const COR_EXTERNO = '#697386';

export function corDaOcorrencia(o: Ocorrencia, categorias: Map<string, Categoria>): string {
  if (o.externo) return o.cor || COR_EXTERNO;
  const id = o.compromisso.categoria_id;
  return (id && categorias.get(id)?.cor) || COR_PADRAO;
}

export function corDoEvento(e: Evento, pessoas: Map<string, Pessoa>): string {
  if (e.tipo === 'ferias_pessoais') return COR_EU;
  if (e.tipo === 'outro') return COR_OUTRO;
  return (e.pessoa_id && pessoas.get(e.pessoa_id)?.cor) || COR_OUTRO;
}

/** Painel a abrir ao tocar numa ocorrência (compromisso do app ou evento externo). */
export function painelDaOcorrencia(o: Ocorrencia): Painel {
  if (o.externo) return { tipo: 'externo', id: o.externo.id };
  return { tipo: 'compromisso', id: o.compromisso.id, data: o.data_original ?? undefined };
}

/** Compromissos do app + eventos externos do Google, num período. */
export function useOcorrencias(de: string, ate: string): Ocorrencia[] {
  const compromissos = useEntidade('compromissos');
  const externos = useExternos();
  const agendas = useAgendasExternas();
  const feriados = useEntidade('feriados');
  return useMemo(() => {
    const cores = new Map(agendas.map((a) => [a.id, a.cor]));
    const visiveis = new Set(agendas.map((a) => a.id));
    // Eventos do Google que contam como feriado aparecem como FERIADO (destaque do dia), não como evento
    const agendasFeriado = idsAgendasFeriado(agendas);
    const ignorados = nomesIgnorados(feriados);
    const doApp = expandirOcorrencias(compromissos, de, ate);
    const deFora = externosComoOcorrencias(
      externos.filter((e) => visiveis.has(e.agenda_id) && !externoEhFeriado(e, agendasFeriado, ignorados)),
      de,
      ate,
      cores,
    );
    return [...doApp, ...deFora].sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim));
  }, [compromissos, externos, agendas, feriados, de, ate]);
}

/** Item de dia inteiro exibido no calendário (aniversário, férias/período). */
export interface ItemDia {
  chave: string;
  rotulo: string;
  cor: string;
  painel: Painel;
}

export function itensDoDia(
  dia: string,
  aniversarios: Aniversario[],
  eventos: Evento[],
  pessoas: Map<string, Pessoa>,
  feriados: MapaFeriados = new Map(),
): ItemDia[] {
  const itens: ItemDia[] = [];
  const feriado = feriados.get(dia);
  if (feriado) {
    itens.push({ chave: `fer-${dia}`, rotulo: `🎉 ${feriado}`, cor: COR_FERIADO, painel: { tipo: 'feriado', data: dia } });
  }
  for (const a of aniversarios) {
    if (a.data !== dia) continue;
    itens.push({
      chave: `aniv-${a.pessoa.id}`,
      rotulo: `🎂 ${nomeExibicao(a.pessoa)}${a.idade !== null ? ` · ${a.idade}` : ''}`,
      cor: COR_ANIVERSARIO,
      painel: { tipo: 'pessoa', id: a.pessoa.id },
    });
  }
  for (const e of eventos) {
    if (e.data_inicio > dia || e.data_fim < dia) continue;
    itens.push({
      chave: `ev-${e.id}`,
      rotulo: `${e.tipo === 'outro' ? '📌' : '🌴'} ${tituloEvento(e, pessoas)}`,
      cor: corDoEvento(e, pessoas),
      painel: { tipo: 'evento', id: e.id },
    });
  }
  return itens;
}

/** Ocorrências, categorias, tarefas, aniversários e períodos no intervalo [de, ate]. */
export function useDadosPeriodo(de: string, ate: string) {
  const ocorrencias = useOcorrencias(de, ate);
  const categoriasLista = useEntidade('categorias');
  const tarefas = useEntidade('tarefas');
  const pessoasLista = useEntidade('pessoas');
  const eventosLista = useEntidade('eventos');

  const categorias = useMemo(() => new Map(categoriasLista.map((c) => [c.id, c])), [categoriasLista]);
  const pessoas = useMemo(() => new Map(pessoasLista.map((p) => [p.id, p])), [pessoasLista]);
  const aniversarios = useMemo(() => aniversariosEntre(pessoasLista, de, ate), [pessoasLista, de, ate]);
  const eventos = useMemo(() => eventosEntre(eventosLista, de, ate), [eventosLista, de, ate]);
  const feriados = useFeriados(de, ate);
  const tarefasPorDia = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      if (!t.prazo || t.status === 'excluida' || t.prazo < de || t.prazo > ate) continue;
      if (!mapa.has(t.prazo)) mapa.set(t.prazo, []);
      mapa.get(t.prazo)!.push(t);
    }
    return mapa;
  }, [tarefas, de, ate]);

  return { ocorrencias, categorias, pessoas, aniversarios, eventos, eventosTodos: eventosLista, tarefasPorDia, feriados };
}

/** Detecta um deslize horizontal (para navegar entre períodos). */
export function ehDeslizeHorizontal(dx: number, dy: number) {
  return Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
export const nomeDiaCurto = (d: Date) => fmtDiaSemana.format(d).replace('.', '');
