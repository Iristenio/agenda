// Telas ainda provisórias (estrutura e estados vazios). O conteúdo real chega nas próximas etapas.
import type { ComponentChildren } from 'preact';
import { IconeConfig, IconeFerias } from '../icones';

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <header class="cabecalho">
      <h1>{titulo}</h1>
    </header>
  );
}

function Vazio({ icone, titulo, children }: { icone: ComponentChildren; titulo: string; children?: ComponentChildren }) {
  return (
    <div class="vazio grande">
      {icone}
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function TelaEquipe() {
  return (
    <>
      <Cabecalho titulo="Equipe" />
      <div class="conteudo">
        <Vazio icone={<IconeFerias />} titulo="Ninguém cadastrado">
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
        <Vazio icone={<IconeConfig />} titulo="Ajustes">
          A conexão com o Google e as preferências chegam na etapa 4.
          <small style={{ marginTop: 12 }}>Versão {__VERSAO__}</small>
        </Vazio>
      </div>
    </>
  );
}
