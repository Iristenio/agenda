// Visão Mês: 6 semanas; tocar num dia abre a visão Dia; deslizar muda o mês.
import { useRef } from 'preact/hooks';
import { ocorrenciasDoDia, type Ocorrencia } from '../../dominio/compromissos';
import { deDataISO, hojeISO, inicioDaSemana, inicioDoMes, somarDias } from '../../dominio/datas';
import { useAgora, useConfig } from '../../dados/ganchos';
import { useEstado } from '../estado';
import { corDaOcorrencia, ehDeslizeHorizontal, nomeDiaCurto, useDadosPeriodo } from './comum';

const MAX_ITENS = 3;

interface Props {
  dataFoco: string;
  aoNavegar: (direcao: 1 | -1) => void;
  aoAbrirDia: (dia: string) => void;
}

export function VisaoMes({ dataFoco, aoNavegar, aoAbrirDia }: Props) {
  const { abrirPainel } = useEstado();
  const config = useConfig();
  const hoje = hojeISO(useAgora());
  const mes = dataFoco.slice(0, 7);
  const primeiro = inicioDaSemana(inicioDoMes(dataFoco), config.primeiro_dia_semana);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i));
  const { ocorrencias, categorias, tarefasPorDia } = useDadosPeriodo(dias[0], dias[41]);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizou = useRef(false); // evita que o deslize também "toque" no dia

  const abrirOcorrencia = (e: Event, o: Ocorrencia) => {
    e.stopPropagation();
    abrirPainel({ tipo: 'compromisso', id: o.compromisso.id, data: o.data_original ?? undefined });
  };

  return (
    <div
      class="mes"
      onPointerDown={(e) => (toque.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const t = toque.current;
        toque.current = null;
        if (t && ehDeslizeHorizontal(e.clientX - t.x, e.clientY - t.y)) {
          deslizou.current = true;
          setTimeout(() => (deslizou.current = false), 400);
          aoNavegar(e.clientX < t.x ? 1 : -1);
        }
      }}
    >
      <div class="mes-cabecalho">
        {dias.slice(0, 7).map((d) => (
          <span key={d}>{nomeDiaCurto(deDataISO(d))}</span>
        ))}
      </div>
      <div class="mes-grade">
        {dias.map((dia) => {
          const doDia = ocorrenciasDoDia(ocorrencias, dia).sort(
            (a, b) => Number(b.compromisso.dia_inteiro) - Number(a.compromisso.dia_inteiro) || a.inicio.localeCompare(b.inicio),
          );
          const tarefas = (tarefasPorDia.get(dia) ?? []).filter((t) => t.status !== 'concluida');
          const total = doDia.length + tarefas.length;
          const visiveis = doDia.slice(0, total > MAX_ITENS ? MAX_ITENS - 1 : MAX_ITENS);
          const vagas = Math.max(0, (total > MAX_ITENS ? MAX_ITENS - 1 : MAX_ITENS) - visiveis.length);
          const restantes = total - visiveis.length - Math.min(vagas, tarefas.length);
          return (
            <div
              key={dia}
              class={`mes-dia${dia.slice(0, 7) !== mes ? ' fora' : ''}${dia === hoje ? ' hoje' : ''}`}
              onClick={() => !deslizou.current && aoAbrirDia(dia)}
              role="button"
              tabIndex={0}
            >
              <span class="mes-numero">{deDataISO(dia).getDate()}</span>
              {visiveis.map((o) => (
                <button
                  key={o.chave}
                  class={`mes-item${o.compromisso.dia_inteiro ? ' inteiro' : ''}`}
                  style={{ '--cor': corDaOcorrencia(o, categorias) }}
                  onClick={(e) => abrirOcorrencia(e, o)}
                >
                  {!o.compromisso.dia_inteiro && o.inicio.slice(0, 10) === dia && <b>{o.inicio.slice(11, 16)}</b>}
                  {o.compromisso.titulo}
                </button>
              ))}
              {tarefas.slice(0, vagas).map((t) => (
                <button
                  key={t.id}
                  class="mes-item tarefa-marcador"
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirPainel({ tipo: 'tarefa', id: t.id });
                  }}
                >
                  ○ {t.titulo}
                </button>
              ))}
              {restantes > 0 && <span class="mes-mais">+{restantes} mais</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
