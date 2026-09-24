// Telas ainda provisórias (estrutura e estados vazios). O conteúdo real chega nas próximas etapas.
import { IconeConfig } from '../icones';

export function TelaConfig() {
  return (
    <>
      <header class="cabecalho">
        <h1>Ajustes</h1>
      </header>
      <div class="conteudo">
        <div class="vazio grande">
          <IconeConfig />
          <strong>Ajustes</strong>
          A conexão com o Google e as preferências chegam na etapa 4.
          <small style={{ marginTop: 12 }}>Versão {__VERSAO__}</small>
        </div>
      </div>
    </>
  );
}
