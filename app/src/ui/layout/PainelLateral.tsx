import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { IconeFechar } from '../icones';

interface Props {
  titulo: string;
  aoFechar: () => void;
  children: ComponentChildren;
}

/** Painel que abre pela direita, sem esconder a área principal (em paisagem). */
export function PainelLateral({ titulo, aoFechar, children }: Props) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <aside class="painel" aria-label={titulo}>
      <div class="painel-topo">
        <h2>{titulo}</h2>
        <button class="botao-icone" onClick={aoFechar} aria-label="Fechar">
          <IconeFechar />
        </button>
      </div>
      <div class="painel-corpo">{children}</div>
    </aside>
  );
}
