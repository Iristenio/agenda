// Ganchos (hooks) da interface para ler dados e se atualizar quando eles mudam.
import { useEffect, useState } from 'preact/hooks';
import { aoMudarDados, lerConfig, listarTodos, type MapaEntidades } from './repositorio';
import type { Config, Entidade } from '../dominio/tipos';
import { CONFIG_PADRAO } from '../dominio/tipos';

/** Executa a consulta e repete sempre que qualquer dado local mudar. */
export function useConsulta<T>(consulta: () => Promise<T>, inicial: T, deps: unknown[] = []): T {
  const [valor, setValor] = useState<T>(inicial);
  useEffect(() => {
    let ativo = true;
    const executar = () => consulta().then((v) => ativo && setValor(v));
    executar();
    const cancelar = aoMudarDados(executar);
    return () => {
      ativo = false;
      cancelar();
    };
  }, deps);
  return valor;
}

export function useEntidade<E extends Entidade>(entidade: E): MapaEntidades[E][] {
  return useConsulta(() => listarTodos(entidade), [] as MapaEntidades[E][], [entidade]);
}

export function useConfig(): Config {
  return useConsulta(lerConfig, CONFIG_PADRAO);
}

/** Força uma nova renderização a cada minuto (para "atrasada" e "hoje" ficarem corretos). */
export function useAgora(intervaloMs = 60_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
