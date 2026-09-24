// Telas da etapa 0: estrutura e estados vazios. O conteúdo real chega nas etapas 1–3.
import type { ComponentChildren } from 'preact';
import {
  IconeAlerta,
  IconeBolo,
  IconeCalendario,
  IconeConfig,
  IconeFerias,
  IconeRelogio,
  IconeTarefas,
} from '../icones';

const formatarDataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const formatarMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <header class="cabecalho">
      <h1>{titulo}</h1>
      {sub && <span class="sub">{sub}</span>}
    </header>
  );
}

function Vazio({ icone, titulo, children, grande }: { icone: ComponentChildren; titulo: string; children?: ComponentChildren; grande?: boolean }) {
  return (
    <div class={`vazio${grande ? ' grande' : ''}`}>
      {icone}
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function TelaHoje() {
  return (
    <>
      <Cabecalho titulo="Hoje" sub={formatarDataLonga.format(new Date())} />
      <div class="conteudo">
        <div class="colunas">
          <section class="cartao">
            <h2><IconeRelogio /> Agenda do dia</h2>
            <Vazio icone={<IconeCalendario />} titulo="Dia livre">Nenhum compromisso hoje.</Vazio>
          </section>
          <section class="cartao">
            <h2><IconeTarefas /> Tarefas</h2>
            <Vazio icone={<IconeTarefas />} titulo="Tudo em dia">Nenhuma tarefa pendente.</Vazio>
          </section>
          <section class="cartao">
            <h2><IconeAlerta /> Radar</h2>
            <Vazio icone={<IconeBolo />} titulo="Sem novidades">Aniversários, férias e alertas aparecem aqui.</Vazio>
          </section>
        </div>
      </div>
    </>
  );
}

export function TelaCalendario() {
  return (
    <>
      <Cabecalho titulo="Calendário" sub={formatarMesAno.format(new Date())} />
      <div class="conteudo">
        <Vazio grande icone={<IconeCalendario />} titulo="Calendário em construção">
          As visões de dia, semana e mês chegam na etapa 2.
        </Vazio>
      </div>
    </>
  );
}

export function TelaTarefas() {
  return (
    <>
      <Cabecalho titulo="Tarefas" />
      <div class="conteudo">
        <Vazio grande icone={<IconeTarefas />} titulo="Nenhuma tarefa ainda">
          As listas de tarefas chegam na etapa 1.
        </Vazio>
      </div>
    </>
  );
}

export function TelaEquipe() {
  return (
    <>
      <Cabecalho titulo="Equipe" />
      <div class="conteudo">
        <Vazio grande icone={<IconeFerias />} titulo="Ninguém cadastrado">
          Pessoas, aniversários e a linha do tempo de férias chegam na etapa 3.
        </Vazio>
      </div>
    </>
  );
}

export function TelaConfig() {
  return (
    <>
      <Cabecalho titulo="Ajustes" />
      <div class="conteudo">
        <Vazio grande icone={<IconeConfig />} titulo="Ajustes">
          A conexão com o Google e as preferências chegam na etapa 4.
          <small style={{ marginTop: 12 }}>Versão {__VERSAO__}</small>
        </Vazio>
      </div>
    </>
  );
}
