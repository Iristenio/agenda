// Formulário de lista de tarefas: nome, cor, excluir (RN27).
import { useEffect, useState } from 'preact/hooks';
import type { Lista } from '../../dominio/tipos';
import { buscar, LISTA_PADRAO_ID, listarTodos } from '../../dados/repositorio';
import { useEntidade } from '../../dados/ganchos';
import { CORES_LISTA, excluirLista, novaLista, salvarLista } from '../acoes/tarefas';
import { useEstado } from '../estado';

export function FormLista({ id }: { id?: string }) {
  const { fecharPainel, avisar, listaAtual, setListaAtual } = useEstado();
  const listas = useEntidade('listas');
  const [l, setL] = useState<Lista | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const existente = id ? await buscar('listas', id) : undefined;
      if (existente) return setL(existente);
      const todas = await listarTodos('listas');
      setL(novaLista('', Math.max(0, ...todas.map((x) => x.ordem)) + 1));
    })();
  }, [id]);

  if (!l) return null;

  async function salvar(e: Event) {
    e.preventDefault();
    const nome = l!.nome.trim();
    if (!nome) return setErro('Informe o nome da lista.');
    const repetida = listas.some((x) => x.ativo && x.id !== l!.id && x.nome.toLowerCase() === nome.toLowerCase());
    if (repetida) return setErro('Já existe uma lista com esse nome.');
    await salvarLista({ ...l!, nome });
    if (!id) setListaAtual(l!.id);
    fecharPainel();
  }

  async function excluir() {
    const desfazer = await excluirLista(l!);
    if (listaAtual === l!.id) setListaAtual(null);
    fecharPainel();
    avisar({ texto: `Lista excluída · tarefas movidas para "Geral"`, desfazer });
  }

  return (
    <form class="formulario" onSubmit={salvar}>
      <input
        class="campo campo-titulo"
        placeholder="Nome da lista"
        value={l.nome}
        autoFocus={!id}
        onInput={(e) => setL({ ...l, nome: e.currentTarget.value })}
      />
      <fieldset>
        <legend>Cor</legend>
        <div class="cores">
          {CORES_LISTA.map((cor) => (
            <button key={cor} type="button" class="cor" style={{ background: cor }} aria-pressed={l.cor === cor} aria-label={`Cor ${cor}`} onClick={() => setL({ ...l, cor })} />
          ))}
        </div>
      </fieldset>
      {erro && <p class="erros" role="alert">{erro}</p>}
      <div class="acoes-form">
        <button type="submit" class="botao primario">{id ? 'Salvar' : 'Criar lista'}</button>
        {id && id !== LISTA_PADRAO_ID && (
          <button type="button" class="botao perigo" onClick={excluir}>Excluir lista</button>
        )}
      </div>
      {id && id !== LISTA_PADRAO_ID && <p class="dica">Ao excluir, as tarefas desta lista vão para "Geral".</p>}
    </form>
  );
}
