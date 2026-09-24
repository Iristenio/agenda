// Detalhes de um evento do Google Agenda criado fora do app (somente leitura).
import { useAgendasExternas, useExternos } from '../../dados/ganchos';
import { deDataISO } from '../../dominio/datas';

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

function quando(inicio: string, fim: string, diaInteiro: boolean): string {
  const d1 = inicio.slice(0, 10);
  const d2 = fim.slice(0, 10);
  const dia = fmtDia.format(deDataISO(d1));
  if (diaInteiro) {
    return d1 === d2 ? `${dia} · dia todo` : `${fmtCurto.format(deDataISO(d1))} a ${fmtCurto.format(deDataISO(d2))} · dias inteiros`;
  }
  if (d1 === d2) return `${dia} · ${inicio.slice(11, 16)} às ${fim.slice(11, 16)}`;
  return `${dia} ${inicio.slice(11, 16)} até ${fmtCurto.format(deDataISO(d2))} ${fim.slice(11, 16)}`;
}

export function PainelExterno({ id }: { id: string }) {
  const externos = useExternos();
  const agendas = useAgendasExternas();
  const e = externos.find((x) => x.id === id);
  if (!e) return <p class="dica">Este evento não está mais disponível.</p>;
  const agenda = agendas.find((a) => a.id === e.agenda_id);

  return (
    <div class="formulario">
      <div class="externo-cabecalho" style={{ '--cor': agenda?.cor ?? '#697386' }}>
        <h3>{e.titulo}</h3>
        <span>
          <i class="bolinha" style={{ background: agenda?.cor ?? '#697386' }} /> {agenda?.nome ?? 'Google Agenda'}
        </span>
      </div>
      <ul class="info-lista">
        <li>
          <span>Quando</span>
          <strong>{quando(e.inicio, e.fim, e.dia_inteiro)}</strong>
        </li>
        {e.local && (
          <li>
            <span>Local</span>
            <strong>{e.local}</strong>
          </li>
        )}
        {e.livre && (
          <li>
            <span>Disponibilidade</span>
            <strong>Marcado como livre</strong>
          </li>
        )}
      </ul>
      <p class="dica">
        Este evento foi criado fora do app (convite, reunião ou agenda compartilhada) e aparece aqui somente para
        consulta. Para alterar, use o Google Agenda.
      </p>
      {e.link && (
        <div class="acoes-form">
          <a class="botao primario" href={e.link} target="_blank" rel="noopener noreferrer">
            Abrir no Google Agenda
          </a>
        </div>
      )}
    </div>
  );
}
