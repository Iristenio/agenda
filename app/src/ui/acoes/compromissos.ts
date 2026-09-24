// Ações de compromissos e categorias usadas pela interface.
import type { Categoria, Compromisso } from '../../dominio/tipos';
import {
  alterarSeguintes,
  alterarSoEsta,
  alterarTodas,
  excluirSeguintes,
  excluirSoEsta,
  excluirTodas,
  expandirOcorrencias,
  type Escopo,
  type Ocorrencia,
} from '../../dominio/compromissos';
import { paraRRule, type Recorrencia } from '../../dominio/recorrencia';
import { gravar, listarTodos, novoId, salvar } from '../../dados/repositorio';

type Desfazer = () => Promise<void>;

/** Grava os registros e devolve uma função que restaura o estado anterior. */
async function gravarComDesfazer(registros: Compromisso[], excluir = false): Promise<Desfazer> {
  const anteriores = await gravar(
    registros.map((registro) => ({
      entidade: 'compromissos' as const,
      registro,
      operacao: excluir && registro.status === 'excluido' ? ('excluir' as const) : undefined,
    })),
  );
  return async () => {
    await gravar(
      registros.map((atual, i) => ({
        entidade: 'compromissos' as const,
        registro: (anteriores[i] as Compromisso | undefined) ?? { ...atual, status: 'excluido' as const },
      })),
    );
  };
}

async function excecoesDa(serieId: string): Promise<Compromisso[]> {
  return (await listarTodos('compromissos')).filter((c) => c.serie_id === serieId);
}

/** Campos que não dependem de data/hora (aplicáveis à série a partir de uma exceção). */
function camposGerais(de: Compromisso, para: Compromisso): Compromisso {
  const { titulo, descricao, local, categoria_id, lembretes, sync_google } = de;
  return { ...para, titulo, descricao, local, categoria_id, lembretes, sync_google };
}

/** Reconstrói a ocorrência aberta no calendário a partir do id do registro e da data. */
export async function carregarOcorrencia(id: string, data?: string): Promise<Ocorrencia | null> {
  const todos = await listarTodos('compromissos');
  const registro = todos.find((c) => c.id === id);
  if (!registro) return null;
  const serie = registro.serie_id ? (todos.find((c) => c.id === registro.serie_id) ?? null) : registro.rrule ? registro : null;

  if (registro.rrule && data) {
    const relacionados = todos.filter((c) => c.id === registro.id || c.serie_id === registro.id);
    const achada = expandirOcorrencias(relacionados, data, data).find((o) => o.compromisso.id === id && o.data_original === data);
    if (achada) return achada;
  }
  return {
    compromisso: registro,
    serie,
    inicio: registro.inicio,
    fim: registro.fim,
    data_original: registro.ocorrencia_original?.slice(0, 10) ?? (registro.rrule ? registro.inicio.slice(0, 10) : null),
    chave: registro.rrule ? `${registro.id}@${registro.inicio.slice(0, 10)}` : registro.id,
  };
}

/** A ocorrência faz parte de uma série (é o mestre expandido ou uma exceção)? */
export const ehDeSerie = (o: Ocorrencia | null | undefined) => !!o?.serie;

/**
 * Salva um compromisso. `ocorrencia` = o que foi aberto no calendário (null para novo).
 * `escopo` só é usado quando a ocorrência pertence a uma série.
 */
export async function salvarCompromisso(
  editado: Compromisso,
  rec: Recorrencia | null,
  ocorrencia: Ocorrencia | null,
  escopo: Escopo | null,
): Promise<Desfazer> {
  const serie = ocorrencia?.serie;

  // Novo ou avulso (não pertence a série)
  if (!serie || !ocorrencia?.data_original || !escopo) {
    return gravarComDesfazer([{ ...editado, rrule: rec ? paraRRule(rec, editado.inicio) : null }]);
  }

  const ehExcecao = ocorrencia.compromisso.id !== serie.id;
  const excecoes = await excecoesDa(serie.id);

  switch (escopo) {
    case 'esta':
      return gravarComDesfazer([alterarSoEsta(serie, ocorrencia.data_original, editado, novoId)]);
    case 'seguintes': {
      const base = ehExcecao ? camposGerais(editado, { ...serie, inicio: ocorrencia.inicio, fim: ocorrencia.fim }) : editado;
      return gravarComDesfazer(alterarSeguintes(serie, ocorrencia.data_original, base, rec, excecoes, novoId));
    }
    case 'todas': {
      if (ehExcecao) {
        // Editando uma exceção: só os campos gerais vão para a série (datas continuam as da série)
        return gravarComDesfazer([camposGerais(editado, serie), camposGerais(editado, editado)]);
      }
      return gravarComDesfazer(alterarTodas(serie, ocorrencia.inicio, editado, rec, excecoes));
    }
  }
}

export async function excluirCompromisso(ocorrencia: Ocorrencia, escopo: Escopo | null): Promise<Desfazer> {
  const serie = ocorrencia.serie;
  const registro = ocorrencia.compromisso;

  if (!serie || !ocorrencia.data_original || !escopo) {
    return gravarComDesfazer([{ ...registro, status: 'excluido' }], true);
  }

  const excecoes = await excecoesDa(serie.id);
  const ehExcecao = registro.id !== serie.id;
  switch (escopo) {
    case 'esta':
      // Exceção: basta excluí-la (a ocorrência original continua suprimida)
      return ehExcecao
        ? gravarComDesfazer([{ ...registro, status: 'excluido' }], true)
        : gravarComDesfazer([excluirSoEsta(serie, ocorrencia.data_original)]);
    case 'seguintes':
      return gravarComDesfazer(excluirSeguintes(serie, ocorrencia.data_original, excecoes), true);
    case 'todas':
      return gravarComDesfazer(excluirTodas(serie, excecoes), true);
  }
}

/* ---------------- Categorias ---------------- */

export const CORES_CATEGORIA = ['#2f6fed', '#30a46c', '#e5484d', '#8e4ec6', '#f5a524', '#12a594', '#e54666', '#978365', '#697386'];

export function novaCategoria(ordem: number): Categoria {
  const carimbo = new Date().toISOString();
  return {
    id: novoId(),
    nome: '',
    cor: CORES_CATEGORIA[ordem % CORES_CATEGORIA.length],
    icone: '',
    ordem,
    ativo: true,
    privada: false,
    criado_em: carimbo,
    atualizado_em: carimbo,
  };
}

export async function salvarCategoria(c: Categoria) {
  await salvar('categorias', c);
}

/** Excluir categoria: os compromissos ficam sem categoria. */
export async function excluirCategoria(c: Categoria): Promise<Desfazer> {
  const afetados = (await listarTodos('compromissos')).filter((x) => x.categoria_id === c.id);
  const anteriores = await gravar([
    { entidade: 'categorias', registro: { ...c, ativo: false }, operacao: 'excluir' },
    ...afetados.map((registro) => ({ entidade: 'compromissos' as const, registro: { ...registro, categoria_id: null } })),
  ]);
  return async () => {
    await gravar([
      { entidade: 'categorias', registro: anteriores[0] as Categoria },
      ...afetados.map((registro) => ({ entidade: 'compromissos' as const, registro })),
    ]);
  };
}
