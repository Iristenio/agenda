import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useTela, type Tela } from './rotas';
import { MenuLateral } from './layout/MenuLateral';
import { PainelLateral } from './layout/PainelLateral';
import { BotaoNovo, type TipoNovo } from './layout/BotaoNovo';
import { AvisoAtualizacao } from './layout/AvisoAtualizacao';
import { TelaCalendario, TelaConfig, TelaEquipe, TelaHoje, TelaTarefas } from './telas/Telas';

const TELA: Record<Tela, () => JSX.Element> = {
  hoje: TelaHoje,
  calendario: TelaCalendario,
  tarefas: TelaTarefas,
  equipe: TelaEquipe,
  config: TelaConfig,
};

const TITULO_NOVO: Record<TipoNovo, string> = {
  compromisso: 'Novo compromisso',
  tarefa: 'Nova tarefa',
  ferias: 'Novas férias',
  pessoa: 'Nova pessoa',
};

const ETAPA_NOVO: Record<TipoNovo, number> = { tarefa: 1, compromisso: 2, ferias: 3, pessoa: 3 };

export function App() {
  const tela = useTela();
  const [novo, setNovo] = useState<TipoNovo | null>(null);
  const fecharPainel = useCallback(() => setNovo(null), []);
  const Conteudo = TELA[tela];

  return (
    <div class="estrutura">
      <MenuLateral atual={tela} />
      <main class="principal">
        <Conteudo />
        {tela !== 'config' && <BotaoNovo aoEscolher={setNovo} />}
      </main>
      {novo && (
        <PainelLateral titulo={TITULO_NOVO[novo]} aoFechar={fecharPainel}>
          <p style={{ color: 'var(--texto-2)' }}>
            O formulário chega na etapa {ETAPA_NOVO[novo]}. O painel abre deste lado para que o
            calendário continue visível enquanto você preenche.
          </p>
        </PainelLateral>
      )}
      <AvisoAtualizacao />
    </div>
  );
}
