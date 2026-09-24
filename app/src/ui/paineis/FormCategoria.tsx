// Formulário de categoria de compromisso: nome, cor, excluir.
import { useEffect, useState } from 'preact/hooks';
import type { Categoria } from '../../dominio/tipos';
import { buscar, listarTodos } from '../../dados/repositorio';
import { CORES_CATEGORIA, excluirCategoria, novaCategoria, salvarCategoria } from '../acoes/compromissos';
import { useEstado } from '../estado';

export function FormCategoria({ id }: { id?: string }) {
  const { fecharPainel, avisar } = useEstado();
  const [c, setC] = useState<Categoria | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const existente = id ? await buscar('categorias', id) : undefined;
      if (existente) return setC(existente);
      const todas = await listarTodos('categorias');
      setC(novaCategoria(todas.length));
    })();
  }, [id]);

  if (!c) return null;

  async function salvar(e: Event) {
    e.preventDefault();
    const nome = c!.nome.trim();
    if (!nome) return setErro('Informe o nome da categoria.');
    const todas = await listarTodos('categorias');
    if (todas.some((x) => x.ativo && x.id !== c!.id && x.nome.toLowerCase() === nome.toLowerCase()))
      return setErro('Já existe uma categoria com esse nome.');
    await salvarCategoria({ ...c!, nome });
    fecharPainel();
    avisar({ texto: id ? 'Categoria salva' : `Categoria "${nome}" criada` });
  }

  async function excluir() {
    const desfazer = await excluirCategoria(c!);
    fecharPainel();
    avisar({ texto: 'Categoria excluída', desfazer });
  }

  return (
    <form class="formulario" onSubmit={salvar}>
      <input class="campo campo-titulo" placeholder="Nome da categoria" value={c.nome} autoFocus={!id} onInput={(e) => setC({ ...c, nome: e.currentTarget.value })} />
      <fieldset>
        <legend>Cor</legend>
        <div class="cores">
          {CORES_CATEGORIA.map((cor) => (
            <button key={cor} type="button" class="cor" style={{ background: cor }} aria-pressed={c.cor === cor} aria-label={`Cor ${cor}`} onClick={() => setC({ ...c, cor })} />
          ))}
        </div>
      </fieldset>
      <label class="interruptor">
        <input type="checkbox" checked={!!c.privada} onChange={(e) => setC({ ...c, privada: e.currentTarget.checked })} />
        <span>
          Privada no Google Agenda
          <small> — quem vê sua agenda enxerga só "ocupado", sem título nem detalhes</small>
        </span>
      </label>
      {erro && <p class="erros" role="alert">{erro}</p>}
      <div class="acoes-form">
        <button type="submit" class="botao primario">{id ? 'Salvar' : 'Criar categoria'}</button>
        {id && <button type="button" class="botao perigo" onClick={excluir}>Excluir</button>}
      </div>
    </form>
  );
}
