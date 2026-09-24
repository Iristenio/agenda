// Tela inicial: agenda do dia · tarefas · radar.
import { useState } from 'preact/hooks';
import { estaAtrasada, ordenarTarefas } from '../../dominio/tarefas';
import { agoraDataHora, hojeISO } from '../../dominio/datas';
import type { Ocorrencia } from '../../dominio/compromissos';
import { corDaOcorrencia, useDadosPeriodo } from '../calendario/comum';
import { LISTA_PADRAO_ID } from '../../dados/repositorio';
import { useAgora, useEntidade } from '../../dados/ganchos';
import { criarTarefaRapida } from '../acoes/tarefas';
import { useEstado } from '../estado';
import { ItemTarefa } from '../componentes/ItemTarefa';
import { irPara } from '../rotas';
import { IconeCalendario, IconeMais, IconeRelogio, IconeTarefas } from '../icones';
import { CartaoRadar } from '../componentes/CartaoRadar';

const formatarDataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function TelaHoje() {
  const agora = useAgora();
  return (
    <>
      <header class="cabecalho">
        <h1>Hoje</h1>
        <span class="sub">{formatarDataLonga.format(agora)}</span>
      </header>
      <div class="conteudo">
        <div class="colunas">
          <CartaoAgenda agora={agora} />
          <CartaoTarefas agora={agora} />
          <CartaoRadar agora={agora} />
        </div>
      </div>
    </>
  );
}

/** Compromissos de hoje em linha do tempo; o que já passou fica esmaecido. */
function CartaoAgenda({ agora }: { agora: Date }) {
  const { abrirPainel, setDataFoco, setVisao } = useEstado();
  const hoje = hojeISO(agora);
  const { ocorrencias, categorias } = useDadosPeriodo(hoje, hoje);
  const agoraTexto = agoraDataHora(agora);
  const diaInteiro = ocorrencias.filter((o) => o.compromisso.dia_inteiro);
  const comHora = ocorrencias.filter((o) => !o.compromisso.dia_inteiro);
  const proximo = comHora.find((o) => o.fim > agoraTexto);

  const abrir = (o: Ocorrencia) => abrirPainel({ tipo: 'compromisso', id: o.compromisso.id, data: o.data_original ?? undefined });
  const hora = (dh: string) => (dh.slice(0, 10) === hoje ? dh.slice(11, 16) : '…');

  return (
    <section class="cartao">
      <h2>
        <IconeRelogio /> Agenda do dia
        {comHora.length + diaInteiro.length > 0 && <span class="contagem">{comHora.length + diaInteiro.length}</span>}
      </h2>
      {diaInteiro.map((o) => (
        <button key={o.chave} class="agenda-inteiro" style={{ '--cor': corDaOcorrencia(o, categorias) }} onClick={() => abrir(o)}>
          {o.compromisso.titulo} <small>dia todo</small>
        </button>
      ))}
      {comHora.length === 0 && diaInteiro.length === 0 ? (
        <div class="vazio">
          <IconeCalendario />
          <strong>Dia livre</strong>
          Nenhum compromisso hoje.
        </div>
      ) : (
        <ol class="agenda-lista">
          {comHora.map((o) => {
            const passou = o.fim <= agoraTexto;
            const emCurso = o.inicio <= agoraTexto && !passou;
            return (
              <li key={o.chave}>
                <button
                  class={`agenda-item${passou ? ' passou' : ''}${emCurso ? ' em-curso' : ''}${o === proximo && !emCurso ? ' proximo' : ''}`}
                  style={{ '--cor': corDaOcorrencia(o, categorias) }}
                  onClick={() => abrir(o)}
                >
                  <span class="agenda-hora">
                    {hora(o.inicio)}
                    <small>{hora(o.fim)}</small>
                  </span>
                  <span class="agenda-texto">
                    <strong>{o.compromisso.titulo}</strong>
                    {emCurso && <em>agora</em>}
                    {o.compromisso.local && <small>{o.compromisso.local}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button
        class="link"
        onClick={() => {
          setDataFoco(hoje);
          setVisao('dia');
          irPara('calendario');
        }}
      >
        Abrir no calendário →
      </button>
    </section>
  );
}

/** Tarefas do dia: atrasadas, com prazo hoje, em andamento e as de prioridade alta sem prazo. */
function CartaoTarefas({ agora }: { agora: Date }) {
  const { avisar } = useEstado();
  const [titulo, setTitulo] = useState('');
  const hoje = hojeISO(agora);
  const tarefas = useEntidade('tarefas');

  const doDia = ordenarTarefas(
    tarefas.filter((t) => {
      if (t.status === 'concluida') return t.prazo === hoje && t.concluida_em?.slice(0, 10) === hoje;
      if (t.status === 'excluida') return false;
      return estaAtrasada(t, agora) || t.prazo === hoje || t.status === 'andamento' || (!t.prazo && t.prioridade === 'alta');
    }),
    agora,
  );
  const abertas = doDia.filter((t) => t.status !== 'concluida').length;

  async function adicionar(e: Event) {
    e.preventDefault();
    if (!titulo.trim()) return;
    await criarTarefaRapida(titulo, LISTA_PADRAO_ID, hoje);
    setTitulo('');
    avisar({ texto: 'Tarefa criada para hoje' });
  }

  return (
    <section class="cartao">
      <h2>
        <IconeTarefas /> Tarefas
        {abertas > 0 && <span class="contagem">{abertas}</span>}
      </h2>
      <form class="adicionar-rapido compacto" onSubmit={adicionar}>
        <IconeMais />
        <input class="campo" placeholder="Nova tarefa para hoje" value={titulo} onInput={(e) => setTitulo(e.currentTarget.value)} enterKeyHint="done" />
      </form>
      {doDia.length === 0 ? (
        <div class="vazio">
          <IconeTarefas />
          <strong>Tudo em dia</strong>
          Nenhuma tarefa para hoje.
        </div>
      ) : (
        <div class="lista-compacta">
          {doDia.map((t) => <ItemTarefa key={t.id} tarefa={t} agora={agora} compacto />)}
        </div>
      )}
      <button class="link" onClick={() => irPara('tarefas')}>Ver todas as tarefas →</button>
    </section>
  );
}
