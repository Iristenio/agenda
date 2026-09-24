// Estado global da interface: painel lateral aberto, aviso "Desfazer" e lista selecionada.
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';

export type Painel =
  | { tipo: 'tarefa'; id?: string; lista_id?: string }
  | { tipo: 'lista'; id?: string }
  | { tipo: 'em_breve'; titulo: string; etapa: number };

export interface Aviso {
  texto: string;
  desfazer?: () => void | Promise<void>;
}

interface EstadoUI {
  painel: Painel | null;
  abrirPainel: (p: Painel) => void;
  fecharPainel: () => void;
  aviso: Aviso | null;
  avisar: (a: Aviso) => void;
  fecharAviso: () => void;
  listaAtual: string | null; // null = todas as listas
  setListaAtual: (id: string | null) => void;
}

const Contexto = createContext<EstadoUI | null>(null);

export function ProvedorEstado({ children }: { children: ComponentChildren }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [listaAtual, setListaAtual] = useState<string | null>(null);
  const timer = useRef<number>();

  const fecharPainel = useCallback(() => setPainel(null), []);
  const fecharAviso = useCallback(() => setAviso(null), []);
  const avisar = useCallback((a: Aviso) => {
    clearTimeout(timer.current);
    setAviso(a);
    timer.current = window.setTimeout(() => setAviso(null), a.desfazer ? 6000 : 3500);
  }, []);

  const valor = useMemo(
    () => ({ painel, abrirPainel: setPainel, fecharPainel, aviso, avisar, fecharAviso, listaAtual, setListaAtual }),
    [painel, aviso, listaAtual],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoUI {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useEstado fora do ProvedorEstado');
  return ctx;
}
