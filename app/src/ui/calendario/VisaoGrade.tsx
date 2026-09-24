// Visões Dia e Semana: grade de horários com eventos posicionados.
//  • Tocar num horário vazio → novo compromisso (1 h)
//  • Tocar e segurar, depois arrastar → escolhe o intervalo
//  • Deslizar para os lados → período anterior/seguinte
import { useEffect, useRef, useState } from 'preact/hooks';
import { organizarColunas, ocorrenciasDoDia, type Ocorrencia } from '../../dominio/compromissos';
import { deDataISO, diferencaMinutos, hojeISO, paraHora, somarDias } from '../../dominio/datas';
import { useAgora } from '../../dados/ganchos';
import { useEstado } from '../estado';
import { corDaOcorrencia, ehDeslizeHorizontal, itensDoDia, nomeDiaCurto, useDadosPeriodo } from './comum';

const HORA_PX = 56;
const MIN_PX = HORA_PX / 60;
const TOQUE_LONGO_MS = 420;
const HORAS = Array.from({ length: 24 }, (_, h) => h);
const dois = (n: number) => String(n).padStart(2, '0');
const minParaHora = (m: number) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;

interface Props {
  dias: string[];
  aoNavegar: (direcao: 1 | -1) => void;
  aoAbrirDia: (dia: string) => void;
}

interface Selecao {
  dia: string;
  ancora: number; // minuto onde começou
  ini: number;
  fim: number;
}

export function VisaoGrade({ dias, aoNavegar, aoAbrirDia }: Props) {
  const { abrirPainel } = useEstado();
  const agora = useAgora();
  const hoje = hojeISO(agora);
  const { ocorrencias, categorias, tarefasPorDia, aniversarios, eventos, pessoas } = useDadosPeriodo(dias[0], dias[dias.length - 1]);
  const corpo = useRef<HTMLDivElement>(null);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const gesto = useRef<{ x: number; y: number; dia: string; topo: number; timer: number; moveu: boolean; selecionando: boolean } | null>(null);

  // Rola até 7h (ou uma hora antes de agora) ao abrir
  useEffect(() => {
    const hora = dias.includes(hoje) ? Math.max(0, agora.getHours() - 1) : 7;
    if (corpo.current) corpo.current.scrollTop = hora * HORA_PX;
  }, [dias.length]);

  // Durante a seleção, impede que o navegador role a grade
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const bloquear = (e: TouchEvent) => gesto.current?.selecionando && e.preventDefault();
    el.addEventListener('touchmove', bloquear, { passive: false });
    return () => el.removeEventListener('touchmove', bloquear);
  }, []);

  const minutoDoY = (y: number, topo: number) => Math.max(0, Math.min(24 * 60, Math.round((y - topo) / MIN_PX / 15) * 15));

  function aoTocar(e: PointerEvent, dia: string) {
    const coluna = e.currentTarget as HTMLElement;
    const topo = coluna.getBoundingClientRect().top;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      const g = gesto.current;
      if (!g || g.moveu || (e.target as HTMLElement).closest('.evento')) return;
      g.selecionando = true;
      try {
        coluna.setPointerCapture(e.pointerId); // continua recebendo o arraste fora da coluna
      } catch {
        /* ponteiro já liberado */
      }
      navigator.vibrate?.(15);
      const ini = Math.floor(minutoDoY(y, topo) / 30) * 30;
      setSelecao({ dia, ancora: ini, ini, fim: Math.min(ini + 60, 1440) });
    }, TOQUE_LONGO_MS);
    gesto.current = { x: e.clientX, y, dia, topo, timer, moveu: false, selecionando: false };
  }

  function aoMover(e: PointerEvent) {
    const g = gesto.current;
    if (!g) return;
    if (g.selecionando) {
      const m = minutoDoY(e.clientY, g.topo);
      setSelecao((s) => s && (m >= s.ancora ? { ...s, ini: s.ancora, fim: Math.max(m, s.ancora + 15) } : { ...s, ini: m, fim: s.ancora + 30 }));
      return;
    }
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) {
      g.moveu = true;
      clearTimeout(g.timer);
    }
  }

  function aoSoltar(e: PointerEvent) {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    clearTimeout(g.timer);

    if (g.selecionando) {
      const s = selecao;
      setSelecao(null);
      if (s) abrirNovo(s.dia, s.ini, s.fim);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (ehDeslizeHorizontal(dx, dy)) return aoNavegar(dx < 0 ? 1 : -1);
    if (!g.moveu && !(e.target as HTMLElement).closest('.evento')) {
      const ini = Math.floor(minutoDoY(g.y, g.topo) / 30) * 30;
      abrirNovo(g.dia, ini, Math.min(ini + 60, 1440));
    }
  }

  function aoCancelar() {
    if (gesto.current) clearTimeout(gesto.current.timer);
    gesto.current = null;
    setSelecao(null);
  }

  function abrirNovo(dia: string, ini: number, fim: number) {
    const inicio = `${dia}T${minParaHora(Math.min(ini, 1425))}`;
    const termino = fim >= 1440 ? `${dia}T23:59` : `${dia}T${minParaHora(fim)}`;
    abrirPainel({ tipo: 'compromisso', inicio, fim: termino });
  }

  const abrirOcorrencia = (o: Ocorrencia) =>
    abrirPainel({ tipo: 'compromisso', id: o.compromisso.id, data: o.data_original ?? undefined });

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  return (
    <div class={`grade ${dias.length === 1 ? 'grade-dia' : 'grade-semana'}`} style={{ '--dias': dias.length }}>
      {/* Cabeçalho com os dias */}
      <div class="grade-cabecalho">
        <div class="grade-calha" />
        {dias.map((dia) => {
          const d = deDataISO(dia);
          return (
            <button key={dia} class={`grade-dia-titulo${dia === hoje ? ' hoje' : ''}`} onClick={() => aoAbrirDia(dia)}>
              <span class="dia-semana">{nomeDiaCurto(d)}</span>
              <span class="dia-numero">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Linha "dia inteiro": eventos sem horário e tarefas com prazo */}
      <div class="grade-dia-inteiro">
        <div class="grade-calha">dia todo</div>
        {dias.map((dia) => {
          const doDia = ocorrenciasDoDia(ocorrencias, dia).filter((o) => o.compromisso.dia_inteiro);
          const tarefas = tarefasPorDia.get(dia) ?? [];
          return (
            <div key={dia} class="celula-dia-inteiro">
              {itensDoDia(dia, aniversarios, eventos, pessoas).map((i) => (
                <button key={i.chave} class="chip-evento" style={{ '--cor': i.cor }} onClick={() => abrirPainel(i.painel)}>
                  {i.rotulo}
                </button>
              ))}
              {doDia.map((o) => (
                <button key={o.chave} class="chip-evento" style={{ '--cor': corDaOcorrencia(o, categorias) }} onClick={() => abrirOcorrencia(o)}>
                  {o.compromisso.titulo}
                </button>
              ))}
              {tarefas.map((t) => (
                <button
                  key={t.id}
                  class={`chip-tarefa${t.status === 'concluida' ? ' concluida' : ''}`}
                  onClick={() => abrirPainel({ tipo: 'tarefa', id: t.id })}
                >
                  {t.status === 'concluida' ? '✓' : '○'} {t.prazo_hora && `${t.prazo_hora} `}{t.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Corpo com horários */}
      <div class="grade-corpo" ref={corpo}>
        <div class="grade-horas" style={{ height: 24 * HORA_PX }}>
          <div class="grade-calha">
            {HORAS.map((h) => (
              <span key={h} class="rotulo-hora" style={{ top: h * HORA_PX }}>
                {h === 0 ? '' : `${dois(h)}:00`}
              </span>
            ))}
          </div>
          {dias.map((dia) => {
            const segmentos = ocorrenciasDoDia(ocorrencias, dia)
              .filter((o) => !o.compromisso.dia_inteiro)
              .map((o) => {
                const inicio = o.inicio < `${dia}T00:00` ? `${dia}T00:00` : o.inicio;
                const limite = `${somarDias(dia, 1)}T00:00`;
                const fim = o.fim > limite ? limite : o.fim;
                return { o, inicio, fim };
              });
            return (
              <div
                key={dia}
                class={`grade-coluna${dia === hoje ? ' hoje' : ''}`}
                onPointerDown={(e) => aoTocar(e, dia)}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoCancelar}
              >
                {organizarColunas(segmentos).map(({ item, coluna, colunas }) => {
                  const minIni = diferencaMinutos(`${dia}T00:00`, item.inicio);
                  const duracao = Math.max(20, diferencaMinutos(item.inicio, item.fim));
                  const o = item.o;
                  return (
                    <button
                      key={o.chave}
                      class={`evento${duracao < 45 ? ' curto' : ''}`}
                      style={{
                        '--cor': corDaOcorrencia(o, categorias),
                        top: minIni * MIN_PX,
                        height: duracao * MIN_PX - 2,
                        left: `calc(${(coluna / colunas) * 100}% + 2px)`,
                        width: `calc(${100 / colunas}% - 4px)`,
                      }}
                      onClick={() => abrirOcorrencia(o)}
                    >
                      <strong>{o.compromisso.titulo || '(sem título)'}</strong>
                      <span>
                        {o.inicio.slice(11, 16)}–{o.fim.slice(11, 16)}
                        {o.serie && ' 🔁'}
                      </span>
                      {o.compromisso.local && duracao >= 60 && <span>{o.compromisso.local}</span>}
                    </button>
                  );
                })}

                {selecao?.dia === dia && (
                  <div class="selecao" style={{ top: selecao.ini * MIN_PX, height: (selecao.fim - selecao.ini) * MIN_PX }}>
                    {minParaHora(selecao.ini)} – {selecao.fim >= 1440 ? '24:00' : minParaHora(selecao.fim)}
                  </div>
                )}

                {dia === hoje && (
                  <div class="linha-agora" style={{ top: minutosAgora * MIN_PX }} aria-label={`Agora, ${paraHora(agora)}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Dias exibidos a partir da data em foco. */
export function diasDaVisao(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => somarDias(inicio, i));
}
