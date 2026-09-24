import type { JSX } from 'preact';
import { useTela, type Tela } from './rotas';
import { MenuLateral } from './layout/MenuLateral';
import { PainelLateral } from './layout/PainelLateral';
import { BotaoNovo, type TipoNovo } from './layout/BotaoNovo';
import { AvisoAtualizacao } from './layout/AvisoAtualizacao';
import { AvisoDesfazer } from './componentes/AvisoDesfazer';
import { Dialogo } from './componentes/Dialogo';
import { ProvedorEstado, useEstado, type Painel } from './estado';
import { TelaHoje } from './telas/TelaHoje';
import { TelaTarefas } from './telas/TelaTarefas';
import { TelaCalendario } from './telas/TelaCalendario';
import { TelaConfig, TelaEquipe } from './telas/Telas';
import { FormTarefa } from './paineis/FormTarefa';
import { FormLista } from './paineis/FormLista';
import { FormCompromisso } from './paineis/FormCompromisso';
import { FormCategoria } from './paineis/FormCategoria';
import { hojeISO, paraDataISO, paraHora } from '../dominio/datas';

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
    case 'compromisso':
      return p.id ? 'Compromisso' : 'Novo compromisso';
    case 'categoria':
      return p.id ? 'Editar categoria' : 'Nova categoria';
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
    case 'compromisso':
      return <FormCompromisso {...painel} />;
    case 'categoria':
      return <FormCategoria id={painel.id} />;
    case 'em_breve':
      return (
        <p style={{ color: 'var(--texto-2)' }}>
          Este formulário chega na etapa {painel.etapa}. O painel abre deste lado para que o calendário continue
          visível enquanto você preenche.
        </p>
      );
  }
}

/** Início sugerido para um novo compromisso: próxima hora cheia hoje, ou 9h em outro dia. */
function inicioSugerido(dia: string): { inicio: string; fim: string } {
  const agora = new Date();
  if (dia === hojeISO(agora) && agora.getHours() < 23) {
    agora.setHours(agora.getHours() + 1, 0, 0, 0);
    const inicio = `${paraDataISO(agora)}T${paraHora(agora)}`;
    agora.setHours(agora.getHours() + 1);
    return { inicio, fim: `${paraDataISO(agora)}T${paraHora(agora)}` };
  }
  return { inicio: `${dia}T09:00`, fim: `${dia}T10:00` };
}

function Estrutura() {
  const tela = useTela();
  const { painel, abrirPainel, fecharPainel, listaAtual, dataFoco } = useEstado();
  const Conteudo = TELA[tela];

  function novo(tipo: TipoNovo) {
    if (tipo === 'tarefa') return abrirPainel({ tipo: 'tarefa', lista_id: listaAtual ?? undefined });
    if (tipo === 'compromisso') {
      const dia = tela === 'calendario' ? dataFoco : hojeISO();
      return abrirPainel({ tipo: 'compromisso', ...inicioSugerido(dia) });
    }
    const titulos = { ferias: 'Novas férias', pessoa: 'Nova pessoa' };
    abrirPainel({ tipo: 'em_breve', titulo: titulos[tipo], etapa: 3 });
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
      <Dialogo />
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
