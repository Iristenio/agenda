// Radar da tela Hoje: aniversários próximos, quem está de férias, próximas saídas e alertas.
import type { ComponentChildren } from 'preact';
import { aniversariosEntre, descreverAniversario, nomeExibicao } from '../../dominio/pessoas';
import { agruparDias, diasAcimaDoLimite, eventosEntre, feriasNoDia, tituloEvento } from '../../dominio/ferias';
import { expandirOcorrencias } from '../../dominio/compromissos';
import { diferencaDias, hojeISO, somarDias } from '../../dominio/datas';
import { useConfig, useEntidade } from '../../dados/ganchos';
import { useEstado, type Painel } from '../estado';
import { irPara } from '../rotas';
import { IconeAlerta, IconeBolo } from '../icones';

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const JANELA_SAIDAS = 14;
const JANELA_ALERTAS = 30;

export function CartaoRadar({ agora }: { agora: Date }) {
  const { abrirPainel } = useEstado();
  const config = useConfig();
  const pessoasLista = useEntidade('pessoas');
  const eventos = useEntidade('eventos');
  const compromissos = useEntidade('compromissos');
  const hoje = hojeISO(agora);
  const pessoas = new Map(pessoasLista.map((p) => [p.id, p]));
  const nome = (id: string | null) => (id && pessoas.get(id) ? nomeExibicao(pessoas.get(id)!) : '');

  const aniversarios = aniversariosEntre(pessoasLista, hoje, somarDias(hoje, config.dias_aviso_aniversario));
  const deFerias = feriasNoDia(eventos, hoje);
  const saindo = eventosEntre(eventos, somarDias(hoje, 1), somarDias(hoje, JANELA_SAIDAS)).filter(
    (e) => e.tipo !== 'outro' && e.data_inicio > hoje,
  );
  const lotados = agruparDias(diasAcimaDoLimite(eventos, config.limite_ausentes_equipe, hoje, somarDias(hoje, JANELA_ALERTAS)).map((d) => d.dia));
  const euDeFerias = deFerias.some((e) => e.tipo === 'ferias_pessoais');
  const compromissosHoje = euDeFerias ? expandirOcorrencias(compromissos, hoje, hoje).filter((o) => !o.compromisso.dia_inteiro).length : 0;

  const vazio = !aniversarios.length && !deFerias.length && !saindo.length && !lotados.length;

  return (
    <section class="cartao">
      <h2>
        <IconeAlerta /> Radar
      </h2>
      {vazio && (
        <div class="vazio">
          <IconeBolo />
          <strong>Sem novidades</strong>
          Aniversários, férias e alertas aparecem aqui.
        </div>
      )}

      {(lotados.length > 0 || compromissosHoje > 0) && (
        <Grupo titulo="Alertas">
          {compromissosHoje > 0 && (
            <LinhaRadar abrirPainel={abrirPainel} icone="⚠️" alerta painel={null} aoTocar={() => irPara('calendario')}>
              Você tem {compromissosHoje} compromisso{compromissosHoje > 1 ? 's' : ''} hoje, durante suas férias
            </LinhaRadar>
          )}
          {lotados.slice(0, 3).map((g) => (
            <LinhaRadar abrirPainel={abrirPainel} key={g.de} icone="⚠️" alerta painel={null} aoTocar={() => irPara('equipe')}>
              Mais de {config.limite_ausentes_equipe} ausentes: {g.de === g.ate ? fmt(g.de) : `${fmt(g.de)} a ${fmt(g.ate)}`}
            </LinhaRadar>
          ))}
        </Grupo>
      )}

      {aniversarios.length > 0 && (
        <Grupo titulo="Aniversários">
          {aniversarios.map((a) => (
            <LinhaRadar abrirPainel={abrirPainel} key={a.pessoa.id} icone="🎂" destaque={a.data === hoje} painel={{ tipo: 'pessoa', id: a.pessoa.id }}>
              <strong>{nomeExibicao(a.pessoa)}</strong> · {descreverAniversario(a, hoje)}
            </LinhaRadar>
          ))}
        </Grupo>
      )}

      {deFerias.length > 0 && (
        <Grupo titulo="De férias hoje">
          {deFerias.map((e) => (
            <LinhaRadar abrirPainel={abrirPainel} key={e.id} icone="🌴" painel={{ tipo: 'evento', id: e.id }}>
              {e.tipo === 'ferias_pessoais' ? (
                <>
                  <strong>Você</strong> · até {fmt(e.data_fim)}
                </>
              ) : (
                <>
                  <strong>{nome(e.pessoa_id)}</strong> · volta {fmt(somarDias(e.data_fim, 1))}
                </>
              )}
            </LinhaRadar>
          ))}
        </Grupo>
      )}

      {saindo.length > 0 && (
        <Grupo titulo={`Saídas nos próximos ${JANELA_SAIDAS} dias`}>
          {saindo.map((e) => {
            const faltam = diferencaDias(hoje, e.data_inicio);
            return (
              <LinhaRadar abrirPainel={abrirPainel} key={e.id} icone="🧳" painel={{ tipo: 'evento', id: e.id }}>
                <strong>{e.tipo === 'ferias_pessoais' ? 'Você' : nome(e.pessoa_id) || tituloEvento(e, pessoas)}</strong> ·{' '}
                {faltam === 1 ? 'amanhã' : `em ${faltam} dias`} ({fmt(e.data_inicio)} a {fmt(e.data_fim)})
              </LinhaRadar>
            );
          })}
        </Grupo>
      )}
    </section>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ComponentChildren }) {
  return (
    <div class="radar-grupo">
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

interface PropsLinha {
  icone: string;
  painel: Painel | null;
  aoTocar?: () => void;
  destaque?: boolean;
  alerta?: boolean;
  abrirPainel: (p: Painel) => void;
  children: ComponentChildren;
}

function LinhaRadar(props: PropsLinha) {
  return (
    <button
      class={`radar-linha${props.destaque ? ' destaque' : ''}${props.alerta ? ' alerta-linha' : ''}`}
      onClick={() => (props.painel ? props.abrirPainel(props.painel) : props.aoTocar?.())}
    >
      <span class="radar-icone" aria-hidden="true">{props.icone}</span>
      <span>{props.children}</span>
    </button>
  );
}
