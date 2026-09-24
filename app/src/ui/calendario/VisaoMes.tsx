// Visão Mês: 6 semanas; tocar num dia abre a visão Dia; deslizar muda o mês.
import { useRef } from 'preact/hooks';
import { ocorrenciasDoDia } from '../../dominio/compromissos';
import { deDataISO, hojeISO, inicioDaSemana, inicioDoMes, somarDias } from '../../dominio/datas';
import { useAgora, useConfig } from '../../dados/ganchos';
import { useEstado, type Painel } from '../estado';
import { corDaOcorrencia, ehDeslizeHorizontal, itensDoDia, nomeDiaCurto, painelDaOcorrencia, useDadosPeriodo } from './comum';

const MAX_ITENS = 3;

interface Props {
  dataFoco: string;
  aoNavegar: (direcao: 1 | -1) => void;
  aoAbrirDia: (dia: string) => void;
}

interface ItemMes {
  chave: string;
  hora?: string;
  rotulo: string;
  cor?: string;
  classe: string;
  painel: Painel;
}

export function VisaoMes({ dataFoco, aoNavegar, aoAbrirDia }: Props) {
  const { abrirPainel } = useEstado();
  const config = useConfig();
  const hoje = hojeISO(useAgora());
  const mes = dataFoco.slice(0, 7);
  const primeiro = inicioDaSemana(inicioDoMes(dataFoco), config.primeiro_dia_semana);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i));
  const { ocorrencias, categorias, tarefasPorDia, aniversarios, eventos, pessoas } = useDadosPeriodo(dias[0], dias[41]);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizou = useRef(false); // evita que o deslize também "toque" no dia

  function itensDe(dia: string): ItemMes[] {
    const itens: ItemMes[] = itensDoDia(dia, aniversarios, eventos, pessoas).map((i) => ({ ...i, classe: 'inteiro' }));
    const doDia = ocorrenciasDoDia(ocorrencias, dia).sort(
      (a, b) => Number(b.compromisso.dia_inteiro) - Number(a.compromisso.dia_inteiro) || a.inicio.localeCompare(b.inicio),
    );
    for (const o of doDia) {
      itens.push({
        chave: o.chave,
        hora: !o.compromisso.dia_inteiro && o.inicio.slice(0, 10) === dia ? o.inicio.slice(11, 16) : undefined,
        rotulo: o.compromisso.titulo,
        cor: corDaOcorrencia(o, categorias),
        classe: `${o.compromisso.dia_inteiro ? 'inteiro' : ''}${o.externo ? ' externo' : ''}`,
        painel: painelDaOcorrencia(o),
      });
    }
    for (const t of tarefasPorDia.get(dia) ?? []) {
      if (t.status === 'concluida') continue;
      itens.push({ chave: t.id, rotulo: `○ ${t.titulo}`, classe: 'tarefa-marcador', painel: { tipo: 'tarefa', id: t.id } });
    }
    return itens;
  }

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
          const itens = itensDe(dia);
          const limite = itens.length > MAX_ITENS ? MAX_ITENS - 1 : MAX_ITENS;
          return (
            <div
              key={dia}
              class={`mes-dia${dia.slice(0, 7) !== mes ? ' fora' : ''}${dia === hoje ? ' hoje' : ''}`}
              onClick={() => !deslizou.current && aoAbrirDia(dia)}
              role="button"
              tabIndex={0}
            >
              <span class="mes-numero">{deDataISO(dia).getDate()}</span>
              {itens.slice(0, limite).map((i) => (
                <button
                  key={i.chave}
                  class={`mes-item ${i.classe}`}
                  style={i.cor ? { '--cor': i.cor } : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirPainel(i.painel);
                  }}
                >
                  {i.hora && <b>{i.hora}</b>}
                  {i.rotulo}
                </button>
              ))}
              {itens.length > limite && <span class="mes-mais">+{itens.length - limite} mais</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
