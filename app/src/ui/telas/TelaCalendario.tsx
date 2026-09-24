// Tela do calendário: barra de navegação + visão Dia / Semana / Mês.
import { deDataISO, hojeISO, inicioDaSemana, somarDias, somarMeses } from '../../dominio/datas';
import { useConfig } from '../../dados/ganchos';
import { useEstado, type Visao } from '../estado';
import { VisaoGrade, diasDaVisao } from '../calendario/VisaoGrade';
import { VisaoMes } from '../calendario/VisaoMes';

const fmtDiaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

function tituloDoPeriodo(visao: Visao, dias: string[], dataFoco: string): string {
  if (visao === 'dia') return fmtDiaLongo.format(deDataISO(dataFoco));
  if (visao === 'mes') return fmtMesAno.format(deDataISO(dataFoco));
  const a = deDataISO(dias[0]);
  const b = deDataISO(dias[dias.length - 1]);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} de ${fmtMesAno.format(b)}`;
  return `${fmtDiaMes.format(a).replace('.', '')} – ${fmtDiaMes.format(b).replace('.', '')} ${b.getFullYear()}`;
}

const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Dia' },
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
];

export function TelaCalendario() {
  const { dataFoco, setDataFoco, visao, setVisao } = useEstado();
  const config = useConfig();
  const hoje = hojeISO();

  const dias =
    visao === 'dia' ? [dataFoco] : visao === 'semana' ? diasDaVisao(inicioDaSemana(dataFoco, config.primeiro_dia_semana), 7) : [];

  function navegar(direcao: 1 | -1) {
    if (visao === 'dia') setDataFoco(somarDias(dataFoco, direcao));
    else if (visao === 'semana') setDataFoco(somarDias(dataFoco, 7 * direcao));
    else setDataFoco(somarMeses(dataFoco, direcao));
  }

  function abrirDia(dia: string) {
    setDataFoco(dia);
    setVisao('dia');
  }

  const titulo = tituloDoPeriodo(visao, dias, dataFoco);
  const mostrandoHoje = visao === 'dia' ? dataFoco === hoje : visao === 'semana' ? dias.includes(hoje) : dataFoco.slice(0, 7) === hoje.slice(0, 7);

  return (
    <>
      <header class="cabecalho cabecalho-calendario">
        <button class="botao" disabled={mostrandoHoje} onClick={() => setDataFoco(hoje)}>
          Hoje
        </button>
        <div class="navegacao">
          <button class="botao-icone" aria-label="Anterior" onClick={() => navegar(-1)}>
            ‹
          </button>
          <button class="botao-icone" aria-label="Seguinte" onClick={() => navegar(1)}>
            ›
          </button>
        </div>
        <h1 class="titulo-periodo">{titulo}</h1>
        <div class="segmentado visoes" role="radiogroup" aria-label="Visão">
          {VISOES.map((v) => (
            <button key={v.valor} role="radio" aria-checked={visao === v.valor} onClick={() => setVisao(v.valor)}>
              {v.rotulo}
            </button>
          ))}
        </div>
      </header>
      <div class="calendario">
        {visao === 'mes' ? (
          <VisaoMes dataFoco={dataFoco} aoNavegar={navegar} aoAbrirDia={abrirDia} />
        ) : (
          <VisaoGrade key={visao} dias={dias} aoNavegar={navegar} aoAbrirDia={abrirDia} />
        )}
      </div>
    </>
  );
}
