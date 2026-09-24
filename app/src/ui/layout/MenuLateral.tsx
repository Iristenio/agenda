import type { ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { irPara, type Tela } from '../rotas';
import { IconeCalendario, IconeConfig, IconeEquipe, IconeHoje, IconeTarefas } from '../icones';

const ITENS: { tela: Tela; rotulo: string; Icone: ComponentType<JSX.SVGAttributes<SVGSVGElement>> }[] = [
  { tela: 'hoje', rotulo: 'Hoje', Icone: IconeHoje },
  { tela: 'calendario', rotulo: 'Calendário', Icone: IconeCalendario },
  { tela: 'tarefas', rotulo: 'Tarefas', Icone: IconeTarefas },
  { tela: 'equipe', rotulo: 'Equipe', Icone: IconeEquipe },
  { tela: 'config', rotulo: 'Ajustes', Icone: IconeConfig },
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => {
      window.removeEventListener('online', atualizar);
      window.removeEventListener('offline', atualizar);
    };
  }, []);
  return online;
}

export function MenuLateral({ atual }: { atual: Tela }) {
  const online = useOnline();
  return (
    <nav class="menu" aria-label="Navegação principal">
      {ITENS.map(({ tela, rotulo, Icone }) => (
        <button
          key={tela}
          class="menu-item"
          aria-current={tela === atual ? 'page' : undefined}
          onClick={() => irPara(tela)}
        >
          <Icone />
          {rotulo}
        </button>
      ))}
      <div class="menu-espaco" />
      {/* Na etapa 4 este indicador passa a mostrar o estado da sincronização (RS07) */}
      <div class="status-sync" title={online ? 'Conectado' : 'Sem internet'}>
        <span class={`status-ponto${online ? ' online' : ''}`} />
        {online ? 'Online' : 'Offline'}
      </div>
    </nav>
  );
}
