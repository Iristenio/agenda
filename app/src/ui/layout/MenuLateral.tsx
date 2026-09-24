import type { ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { irPara, type Tela } from '../rotas';
import { IconeCalendario, IconeConfig, IconeEquipe, IconeHoje, IconeTarefas } from '../icones';
import { ROTULO_STATUS, useSync } from '../../sync/ganchos';

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
  const sync = useSync();
  const status = !online && sync.status !== 'desconectado' ? 'offline' : sync.status;
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
      {/* RS07 — estado da sincronização; tocar abre os Ajustes */}
      <button class="status-sync" onClick={() => irPara('config')} title={sync.erro ?? ROTULO_STATUS[status]}>
        <span class={`status-ponto ${status}`} />
        {ROTULO_STATUS[status]}
        {status === 'pendente' && <small>{sync.pendentes}</small>}
      </button>
    </nav>
  );
}
