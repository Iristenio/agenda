// Diálogo modal de escolha (ex.: "Só esta / Esta e as seguintes / Todas").
import { useEffect } from 'preact/hooks';
import { useEstado } from '../estado';

export function Dialogo() {
  const { dialogo } = useEstado();

  useEffect(() => {
    if (!dialogo) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && dialogo.responder(null);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [dialogo]);

  if (!dialogo) return null;
  return (
    <div class="dialogo-veu" onClick={() => dialogo.responder(null)}>
      <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialogo-titulo">{dialogo.titulo}</h2>
        {dialogo.mensagem && <p>{dialogo.mensagem}</p>}
        <div class="dialogo-opcoes">
          {dialogo.opcoes.map((o) => (
            <button key={o.valor} class={`botao ${o.estilo ?? ''}`} onClick={() => dialogo.responder(o.valor)}>
              {o.rotulo}
            </button>
          ))}
          <button class="botao fantasma" onClick={() => dialogo.responder(null)}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
