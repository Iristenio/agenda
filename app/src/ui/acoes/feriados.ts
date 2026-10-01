// Ações de feriados: cadastrar/editar/excluir e marcar feriados do Google como "não é folga".
import type { Feriado } from '../../dominio/tipos';
import { normalizarNome } from '../../dominio/feriados';
import { gravar, listarTodos, novoId, salvar } from '../../dados/repositorio';

type Desfazer = () => Promise<void>;

export function novoFeriado(campos: Partial<Feriado> = {}): Feriado {
  const carimbo = new Date().toISOString();
  return { id: novoId(), nome: '', data: null, anual: false, tipo: 'folga', status: 'ativo', criado_em: carimbo, atualizado_em: carimbo, ...campos };
}

export async function salvarFeriado(f: Feriado): Promise<Desfazer> {
  const anterior = await salvar('feriados', f);
  return async () => {
    await salvar('feriados', anterior ?? { ...f, status: 'excluido' });
  };
}

export async function excluirFeriado(f: Feriado): Promise<Desfazer> {
  const [anterior] = await gravar([{ entidade: 'feriados', registro: { ...f, status: 'excluido' }, operacao: 'excluir' }]);
  return async () => {
    await salvar('feriados', anterior as Feriado);
  };
}

/** RN43 — um feriado do Google com este nome deixa de contar (em todos os anos). */
export async function marcarNaoFolga(nome: string): Promise<Desfazer> {
  const existentes = await listarTodos('feriados');
  const igual = existentes.find((f) => f.tipo === 'nao_folga' && normalizarNome(f.nome) === normalizarNome(nome));
  return salvarFeriado(igual ? { ...igual, status: 'ativo' } : novoFeriado({ nome: nome.trim(), tipo: 'nao_folga' }));
}

/** Volta a contar como feriado. */
export async function desmarcarNaoFolga(nome: string): Promise<Desfazer> {
  const alvos = (await listarTodos('feriados')).filter(
    (f) => f.tipo === 'nao_folga' && f.status === 'ativo' && normalizarNome(f.nome) === normalizarNome(nome),
  );
  const anteriores = await gravar(alvos.map((f) => ({ entidade: 'feriados' as const, registro: { ...f, status: 'excluido' as const }, operacao: 'excluir' as const })));
  return async () => {
    await gravar(anteriores.map((a) => ({ entidade: 'feriados' as const, registro: a as Feriado })));
  };
}
