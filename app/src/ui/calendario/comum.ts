// Utilitários compartilhados pelas visões do calendário.
import { useMemo } from 'preact/hooks';
import type { Categoria, Evento, Pessoa, Tarefa } from '../../dominio/tipos';
import { expandirOcorrencias, type Ocorrencia } from '../../dominio/compromissos';
import { aniversariosEntre, nomeExibicao, type Aniversario } from '../../dominio/pessoas';
import { eventosEntre, tituloEvento } from '../../dominio/ferias';
import { useEntidade } from '../../dados/ganchos';
import type { Painel } from '../estado';

/** Cor de compromissos sem categoria (fixa: contrasta com texto branco nos dois temas). */
export const COR_PADRAO = '#2f6fed';
export const COR_EU = '#30a46c';
export const COR_OUTRO = '#697386';
export const COR_ANIVERSARIO = '#e54666';

export function corDaOcorrencia(o: Ocorrencia, categorias: Map<string, Categoria>): string {
  const id = o.compromisso.categoria_id;
  return (id && categorias.get(id)?.cor) || COR_PADRAO;
}

export function corDoEvento(e: Evento, pessoas: Map<string, Pessoa>): string {
  if (e.tipo === 'ferias_pessoais') return COR_EU;
  if (e.tipo === 'outro') return COR_OUTRO;
  return (e.pessoa_id && pessoas.get(e.pessoa_id)?.cor) || COR_OUTRO;
}

/** Item de dia inteiro exibido no calendário (aniversário, férias/período). */
export interface ItemDia {
  chave: string;
  rotulo: string;
  cor: string;
  painel: Painel;
}

export function itensDoDia(dia: string, aniversarios: Aniversario[], eventos: Evento[], pessoas: Map<string, Pessoa>): ItemDia[] {
  const itens: ItemDia[] = [];
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
  const compromissos = useEntidade('compromissos');
  const categoriasLista = useEntidade('categorias');
  const tarefas = useEntidade('tarefas');
  const pessoasLista = useEntidade('pessoas');
  const eventosLista = useEntidade('eventos');

  const ocorrencias = useMemo(() => expandirOcorrencias(compromissos, de, ate), [compromissos, de, ate]);
  const categorias = useMemo(() => new Map(categoriasLista.map((c) => [c.id, c])), [categoriasLista]);
  const pessoas = useMemo(() => new Map(pessoasLista.map((p) => [p.id, p])), [pessoasLista]);
  const aniversarios = useMemo(() => aniversariosEntre(pessoasLista, de, ate), [pessoasLista, de, ate]);
  const eventos = useMemo(() => eventosEntre(eventosLista, de, ate), [eventosLista, de, ate]);
  const tarefasPorDia = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      if (!t.prazo || t.status === 'excluida' || t.prazo < de || t.prazo > ate) continue;
      if (!mapa.has(t.prazo)) mapa.set(t.prazo, []);
      mapa.get(t.prazo)!.push(t);
    }
    return mapa;
  }, [tarefas, de, ate]);

  return { ocorrencias, categorias, pessoas, aniversarios, eventos, eventosTodos: eventosLista, tarefasPorDia };
}

/** Detecta um deslize horizontal (para navegar entre períodos). */
export function ehDeslizeHorizontal(dx: number, dy: number) {
  return Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
export const nomeDiaCurto = (d: Date) => fmtDiaSemana.format(d).replace('.', '');
