// Linha de tarefa: tocar abre o painel; círculo conclui; deslizar para a esquerda exclui.
import { useRef, useState } from 'preact/hooks';
import type { Lista, Tarefa } from '../../dominio/tipos';
import { estaAtrasada } from '../../dominio/tarefas';
import { descreverData, hojeISO } from '../../dominio/datas';
import { alternarConclusao, excluirTarefa } from '../acoes/tarefas';
import { useEstado } from '../estado';
import { IconeArrastar, IconeRepetir } from '../icones';

interface Props {
  tarefa: Tarefa;
  lista?: Lista;           // mostra a etiqueta da lista (visão "Todas")
  agora: Date;
  compacto?: boolean;
  aoIniciarArraste?: (e: PointerEvent) => void;
}

const LIMITE_EXCLUIR = 110;

export function ItemTarefa({ tarefa: t, lista, agora, compacto, aoIniciarArraste }: Props) {
  const { abrirPainel, avisar } = useEstado();
  const [dx, setDx] = useState(0);
  const toque = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const concluida = t.status === 'concluida';
  const atrasada = estaAtrasada(t, agora);

  async function concluir(e: Event) {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(12);
    const { texto, desfazer } = await alternarConclusao(t);
    avisar({ texto, desfazer });
  }

  async function excluir() {
    const desfazer = await excluirTarefa(t);
    avisar({ texto: 'Tarefa excluída', desfazer });
  }

  /* ---- deslizar para excluir ---- */
  const aoTocar = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.alca, .check')) return;
    toque.current = { x: e.clientX, y: e.clientY, horizontal: null };
  };
  const aoMover = (e: PointerEvent) => {
    const s = toque.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.horizontal === null && Math.hypot(mx, my) > 10) {
      s.horizontal = Math.abs(mx) > Math.abs(my);
      if (s.horizontal) {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* sem captura: o gesto continua funcionando enquanto o dedo estiver sobre a linha */
        }
      }
    }
    if (s.horizontal) setDx(Math.min(0, mx));
  };
  const aoSoltar = () => {
    const s = toque.current;
    toque.current = null;
    if (s?.horizontal && dx < -LIMITE_EXCLUIR) {
      setDx(-600);
      setTimeout(excluir, 150);
    } else {
      setDx(0);
    }
  };
  const aoClicar = () => {
    if (dx === 0) abrirPainel({ tipo: 'tarefa', id: t.id });
  };

  return (
    <div class={`tarefa-envoltorio${dx < -LIMITE_EXCLUIR ? ' armado' : ''}`}>
      <div class="tarefa-fundo-excluir">Excluir</div>
      <div
        class={`tarefa prioridade-${t.prioridade}${concluida ? ' concluida' : ''}${compacto ? ' compacto' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: toque.current ? 'none' : undefined }}
        onPointerDown={aoTocar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClick={aoClicar}
        data-id={t.id}
      >
        <button class="check" onClick={concluir} aria-label={concluida ? 'Reabrir tarefa' : 'Concluir tarefa'} aria-pressed={concluida}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.5 12.5l3.5 3.5 7.5-8" />
          </svg>
        </button>
        <div class="tarefa-texto">
          <span class="tarefa-titulo">{t.titulo}</span>
          {(t.prazo || t.rrule || lista || t.status === 'andamento' || t.descricao) && (
            <span class="tarefa-meta">
              {t.status === 'andamento' && <span class="etiqueta andamento">Em andamento</span>}
              {t.prazo && (
                <span class={`etiqueta${atrasada ? ' atrasada' : ''}`}>
                  {descreverData(t.prazo, hojeISO(agora))}
                  {t.prazo_hora && ` · ${t.prazo_hora}`}
                </span>
              )}
              {t.rrule && <IconeRepetir class="meta-icone" aria-label="Repete" />}
              {lista && (
                <span class="etiqueta lista">
                  <i style={{ background: lista.cor }} />
                  {lista.nome}
                </span>
              )}
              {t.descricao && !compacto && <span class="tarefa-desc">{t.descricao}</span>}
            </span>
          )}
        </div>
        {aoIniciarArraste && !concluida && (
          <span
            class="alca"
            aria-label="Arrastar para reordenar"
            onPointerDown={(e) => {
              e.stopPropagation();
              aoIniciarArraste(e);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconeArrastar />
          </span>
        )}
      </div>
    </div>
  );
}
