// Utilitários compartilhados pelas visões do calendário.
import { useMemo } from 'preact/hooks';
import type { Categoria, Tarefa } from '../../dominio/tipos';
import { expandirOcorrencias, type Ocorrencia } from '../../dominio/compromissos';
import { useEntidade } from '../../dados/ganchos';

/** Cor de compromissos sem categoria (fixa: contrasta com texto branco nos dois temas). */
export const COR_PADRAO = '#2f6fed';

export function corDaOcorrencia(o: Ocorrencia, categorias: Map<string, Categoria>): string {
  const id = o.compromisso.categoria_id;
  return (id && categorias.get(id)?.cor) || COR_PADRAO;
}

/** Ocorrências, categorias e tarefas com prazo no período [de, ate]. */
export function useDadosPeriodo(de: string, ate: string) {
  const compromissos = useEntidade('compromissos');
  const categoriasLista = useEntidade('categorias');
  const tarefas = useEntidade('tarefas');

  const ocorrencias = useMemo(() => expandirOcorrencias(compromissos, de, ate), [compromissos, de, ate]);
  const categorias = useMemo(() => new Map(categoriasLista.map((c) => [c.id, c])), [categoriasLista]);
  const tarefasPorDia = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      if (!t.prazo || t.status === 'excluida' || t.prazo < de || t.prazo > ate) continue;
      if (!mapa.has(t.prazo)) mapa.set(t.prazo, []);
      mapa.get(t.prazo)!.push(t);
    }
    return mapa;
  }, [tarefas, de, ate]);

  return { ocorrencias, categorias, tarefasPorDia };
}

/** Detecta um deslize horizontal (para navegar entre períodos). */
export function ehDeslizeHorizontal(dx: number, dy: number) {
  return Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
export const nomeDiaCurto = (d: Date) => fmtDiaSemana.format(d).replace('.', '');
