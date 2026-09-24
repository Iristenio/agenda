// Ações de pessoas e eventos (férias/períodos) usadas pela interface.
import type { Evento, Pessoa } from '../../dominio/tipos';
import { gravar, salvar } from '../../dados/repositorio';

type Desfazer = () => Promise<void>;

// Sem o verde (#30a46c), reservado para "Você" na linha do tempo e no calendário
export const CORES_PESSOA = ['#2f6fed', '#e5484d', '#8e4ec6', '#f5a524', '#12a594', '#d6409f', '#6e56cf', '#978365', '#0090ff', '#e86d1f'];

export async function salvarPessoa(p: Pessoa): Promise<Desfazer> {
  const anterior = await salvar('pessoas', p);
  return async () => {
    await salvar('pessoas', anterior ?? { ...p, ativo: false });
  };
}

export async function salvarEvento(e: Evento): Promise<Desfazer> {
  const anterior = await salvar('eventos', e);
  return async () => {
    await salvar('eventos', anterior ?? { ...e, status: 'excluido' });
  };
}

/** RN01 — exclusão lógica. */
export async function excluirEvento(e: Evento): Promise<Desfazer> {
  const [anterior] = await gravar([{ entidade: 'eventos', registro: { ...e, status: 'excluido' }, operacao: 'excluir' }]);
  return async () => {
    await salvar('eventos', anterior as Evento);
  };
}
