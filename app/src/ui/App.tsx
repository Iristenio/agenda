import type { JSX } from 'preact';
import { useTela, type Tela } from './rotas';
import { MenuLateral } from './layout/MenuLateral';
import { PainelLateral } from './layout/PainelLateral';
import { BotaoNovo, type TipoNovo } from './layout/BotaoNovo';
import { AvisoAtualizacao } from './layout/AvisoAtualizacao';
import { AvisoDesfazer } from './componentes/AvisoDesfazer';
import { ProvedorEstado, useEstado, type Painel } from './estado';
import { TelaHoje } from './telas/TelaHoje';
import { TelaTarefas } from './telas/TelaTarefas';
import { TelaCalendario, TelaConfig, TelaEquipe } from './telas/Telas';
import { FormTarefa } from './paineis/FormTarefa';
import { FormLista } from './paineis/FormLista';

const TELA: Record<Tela, () => JSX.Element> = {
  hoje: TelaHoje,
  calendario: TelaCalendario,
  tarefas: TelaTarefas,
  equipe: TelaEquipe,
  config: TelaConfig,
};

function tituloPainel(p: Painel): string {
  switch (p.tipo) {
    case 'tarefa':
      return p.id ? 'Tarefa' : 'Nova tarefa';
    case 'lista':
      return p.id ? 'Editar lista' : 'Nova lista';
    case 'em_breve':
      return p.titulo;
  }
}

function ConteudoPainel({ painel }: { painel: Painel }) {
  switch (painel.tipo) {
    case 'tarefa':
      return <FormTarefa id={painel.id} lista_id={painel.lista_id} />;
    case 'lista':
      return <FormLista id={painel.id} />;
    case 'em_breve':
      return (
        <p style={{ color: 'var(--texto-2)' }}>
          Este formulário chega na etapa {painel.etapa}. O painel abre deste lado para que o calendário continue
          visível enquanto você preenche.
        </p>
      );
  }
}

function Estrutura() {
  const tela = useTela();
  const { painel, abrirPainel, fecharPainel, listaAtual } = useEstado();
  const Conteudo = TELA[tela];

  function novo(tipo: TipoNovo) {
    if (tipo === 'tarefa') return abrirPainel({ tipo: 'tarefa', lista_id: listaAtual ?? undefined });
    const titulos = { compromisso: 'Novo compromisso', ferias: 'Novas férias', pessoa: 'Nova pessoa' };
    abrirPainel({ tipo: 'em_breve', titulo: titulos[tipo], etapa: tipo === 'compromisso' ? 2 : 3 });
  }

  return (
    <div class="estrutura">
      <MenuLateral atual={tela} />
      <main class="principal">
        <Conteudo />
        {tela !== 'config' && <BotaoNovo aoEscolher={novo} />}
      </main>
      {painel && (
        <PainelLateral titulo={tituloPainel(painel)} aoFechar={fecharPainel}>
          <ConteudoPainel painel={painel} />
        </PainelLateral>
      )}
      <AvisoDesfazer />
      <AvisoAtualizacao />
    </div>
  );
}

export function App() {
  return (
    <ProvedorEstado>
      <Estrutura />
    </ProvedorEstado>
  );
}
