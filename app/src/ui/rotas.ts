// Navegação simples por "#/tela" — funciona offline e no GitHub Pages sem configuração extra.
import { useEffect, useState } from 'preact/hooks';

export const TELAS = ['hoje', 'calendario', 'tarefas', 'equipe', 'config'] as const;
export type Tela = (typeof TELAS)[number];

function lerTela(): Tela {
  const nome = location.hash.replace(/^#\/?/, '') as Tela;
  return TELAS.includes(nome) ? nome : 'hoje';
}

export function irPara(tela: Tela) {
  location.hash = `/${tela}`;
}

export function useTela(): Tela {
  const [tela, setTela] = useState<Tela>(lerTela);
  useEffect(() => {
    const aoMudar = () => setTela(lerTela());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return tela;
}
