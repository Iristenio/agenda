// Estado global da interface: painel lateral, avisos, diálogos, lista e data em foco.
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';
import { hojeISO } from '../dominio/datas';

export type Painel =
  | { tipo: 'tarefa'; id?: string; lista_id?: string }
  | { tipo: 'lista'; id?: string }
  | { tipo: 'compromisso'; id?: string; data?: string; inicio?: string; fim?: string; dia_inteiro?: boolean }
  | { tipo: 'categoria'; id?: string }
  | { tipo: 'em_breve'; titulo: string; etapa: number };

export interface Aviso {
  texto: string;
  desfazer?: () => void | Promise<void>;
}

export interface OpcaoDialogo<T extends string> {
  valor: T;
  rotulo: string;
  estilo?: 'primario' | 'perigo';
}

interface Dialogo {
  titulo: string;
  mensagem?: string;
  opcoes: OpcaoDialogo<string>[];
  responder: (valor: string | null) => void;
}

export type Visao = 'dia' | 'semana' | 'mes';

interface EstadoUI {
  painel: Painel | null;
  abrirPainel: (p: Painel) => void;
  fecharPainel: () => void;
  aviso: Aviso | null;
  avisar: (a: Aviso) => void;
  fecharAviso: () => void;
  dialogo: Dialogo | null;
  perguntar: <T extends string>(titulo: string, opcoes: OpcaoDialogo<T>[], mensagem?: string) => Promise<T | null>;
  listaAtual: string | null; // null = todas as listas
  setListaAtual: (id: string | null) => void;
  dataFoco: string; // data exibida no calendário
  setDataFoco: (d: string) => void;
  visao: Visao;
  setVisao: (v: Visao) => void;
}

const Contexto = createContext<EstadoUI | null>(null);

function lerVisao(): Visao {
  try {
    const v = localStorage.getItem('agenda.visao');
    if (v === 'dia' || v === 'semana' || v === 'mes') return v;
  } catch {
    /* armazenamento indisponível */
  }
  return 'semana';
}

export function ProvedorEstado({ children }: { children: ComponentChildren }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [listaAtual, setListaAtual] = useState<string | null>(null);
  const [dataFoco, setDataFoco] = useState(() => hojeISO());
  const [visao, setVisaoInterna] = useState<Visao>(lerVisao);
  const timer = useRef<number>();

  const fecharPainel = useCallback(() => setPainel(null), []);
  const fecharAviso = useCallback(() => setAviso(null), []);
  const avisar = useCallback((a: Aviso) => {
    clearTimeout(timer.current);
    setAviso(a);
    timer.current = window.setTimeout(() => setAviso(null), a.desfazer ? 6000 : 3500);
  }, []);

  const perguntar = useCallback(
    <T extends string>(titulo: string, opcoes: OpcaoDialogo<T>[], mensagem?: string) =>
      new Promise<T | null>((ok) => {
        setDialogo({
          titulo,
          mensagem,
          opcoes,
          responder: (v) => {
            setDialogo(null);
            ok(v as T | null);
          },
        });
      }),
    [],
  );

  const setVisao = useCallback((v: Visao) => {
    setVisaoInterna(v);
    try {
      localStorage.setItem('agenda.visao', v);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const valor = useMemo(
    () => ({
      painel,
      abrirPainel: setPainel,
      fecharPainel,
      aviso,
      avisar,
      fecharAviso,
      dialogo,
      perguntar,
      listaAtual,
      setListaAtual,
      dataFoco,
      setDataFoco,
      visao,
      setVisao,
    }),
    [painel, aviso, dialogo, listaAtual, dataFoco, visao],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoUI {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useEstado fora do ProvedorEstado');
  return ctx;
}
