import { useState } from 'preact/hooks';
import { IconeCalendario, IconeEquipe, IconeFerias, IconeMais, IconeTarefas } from '../icones';

export type TipoNovo = 'compromisso' | 'tarefa' | 'ferias' | 'pessoa';

const OPCOES = [
  { tipo: 'pessoa', rotulo: 'Pessoa', Icone: IconeEquipe },
  { tipo: 'ferias', rotulo: 'Férias', Icone: IconeFerias },
  { tipo: 'tarefa', rotulo: 'Tarefa', Icone: IconeTarefas },
  { tipo: 'compromisso', rotulo: 'Compromisso', Icone: IconeCalendario },
] as const;

export function BotaoNovo({ aoEscolher }: { aoEscolher: (tipo: TipoNovo) => void }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {aberto && <div class="novo-veu" onClick={() => setAberto(false)} />}
      <div class="novo">
        {aberto &&
          OPCOES.map(({ tipo, rotulo, Icone }, i) => (
            <button
              key={tipo}
              class="novo-opcao"
              style={{ animationDelay: `${(OPCOES.length - 1 - i) * 30}ms` }}
              onClick={() => {
                setAberto(false);
                aoEscolher(tipo);
              }}
            >
              <Icone />
              {rotulo}
            </button>
          ))}
        <button
          class="novo-principal"
          aria-label="Criar novo"
          aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}
        >
          <IconeMais />
        </button>
      </div>
    </>
  );
}
