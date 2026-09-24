// Tela de Tarefas: listas à esquerda, tarefas agrupadas por prazo à direita.
import { useMemo, useRef, useState } from 'preact/hooks';
import type { Lista, Tarefa } from '../../dominio/tipos';
import { agruparTarefas, estaAberta, estaAtrasada, ordemEntre, TITULO_GRUPO, visivelNaLista } from '../../dominio/tarefas';
import { LISTA_PADRAO_ID } from '../../dados/repositorio';
import { useAgora, useConfig, useEntidade } from '../../dados/ganchos';
import { criarTarefaRapida, mudarOrdem } from '../acoes/tarefas';
import { useEstado } from '../estado';
import { ItemTarefa } from '../componentes/ItemTarefa';
import { IconeLapis, IconeLista, IconeMais, IconeTarefas } from '../icones';

/** Tarefas com a mesma chave ficam empatadas na ordenação — só entre elas a ordem manual vale. */
const chaveBloco = (t: Tarefa, agora: Date) => `${estaAtrasada(t, agora)}|${t.prioridade}|${t.prazo}|${t.prazo_hora}`;

export function TelaTarefas() {
  const { listaAtual, setListaAtual, abrirPainel, avisar } = useEstado();
  const agora = useAgora();
  const config = useConfig();
  const todasTarefas = useEntidade('tarefas');
  const listas = useEntidade('listas')
    .filter((l) => l.ativo)
    .sort((a, b) => a.ordem - b.ordem);
  const mapaListas = new Map(listas.map((l) => [l.id, l]));
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');

  const listaSelecionada = listaAtual ? mapaListas.get(listaAtual) : undefined;
  const visiveis = todasTarefas.filter(
    (t) => visivelNaLista(t, config.dias_manter_concluidas, agora) && (!listaAtual || t.lista_id === listaAtual),
  );
  const grupos = useMemo(() => agruparTarefas(visiveis, agora), [visiveis, agora]);
  const abertasPorLista = (id: string | null) => todasTarefas.filter((t) => estaAberta(t) && (!id || t.lista_id === id)).length;

  async function adicionar(e: Event) {
    e.preventDefault();
    if (!novoTitulo.trim()) return;
    await criarTarefaRapida(novoTitulo, listaAtual ?? LISTA_PADRAO_ID);
    setNovoTitulo('');
    avisar({ texto: 'Tarefa criada' });
  }

  /* ---------- arrastar para reordenar ---------- */
  const [arraste, setArraste] = useState<{ id: string; dy: number } | null>(null);
  const conteiner = useRef<HTMLDivElement>(null);

  function iniciarArraste(e: PointerEvent, t: Tarefa, grupo: Tarefa[]) {
    const bloco = grupo.filter((x) => chaveBloco(x, agora) === chaveBloco(t, agora));
    if (bloco.length < 2) return;
    const linhas = bloco.map((x) => conteiner.current!.querySelector<HTMLElement>(`[data-id="${x.id}"]`)!.getBoundingClientRect());
    const idx = bloco.findIndex((x) => x.id === t.id);
    const minDy = linhas[0].top - linhas[idx].top;
    const maxDy = linhas[linhas.length - 1].top - linhas[idx].top;
    const inicioY = e.clientY;
    let dy = 0;

    const mover = (ev: PointerEvent) => {
      dy = Math.max(minDy, Math.min(maxDy, ev.clientY - inicioY));
      setArraste({ id: t.id, dy });
    };
    const soltar = async () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      setArraste(null);
      const centro = linhas[idx].top + linhas[idx].height / 2 + dy;
      const outros = bloco.filter((x) => x.id !== t.id);
      const outrasLinhas = linhas.filter((_, i) => i !== idx);
      // Posição final = quantas outras linhas ficaram acima do centro da linha arrastada
      const destino = outrasLinhas.filter((r) => {
        const meio = r.top + r.height / 2;
        return meio < centro || (dy > 0 && meio === centro);
      }).length;
      if (destino === idx) return;
      await mudarOrdem(t, ordemEntre(outros[destino - 1]?.ordem, outros[destino]?.ordem));
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    setArraste({ id: t.id, dy: 0 });
  }

  const titulo = listaSelecionada?.nome ?? 'Todas as tarefas';

  return (
    <>
      <header class="cabecalho">
        <h1>Tarefas</h1>
      </header>
      <div class="tarefas-layout">
        <nav class="listas" aria-label="Listas">
          <BotaoLista rotulo="Todas" cor={null} contagem={abertasPorLista(null)} ativa={!listaAtual} aoClicar={() => setListaAtual(null)} />
          {listas.map((l) => (
            <BotaoLista key={l.id} rotulo={l.nome} cor={l.cor} contagem={abertasPorLista(l.id)} ativa={listaAtual === l.id} aoClicar={() => setListaAtual(l.id)} />
          ))}
          <button class="lista-item nova" onClick={() => abrirPainel({ tipo: 'lista' })}>
            <IconeMais />
            Nova lista
          </button>
        </nav>

        <section class="tarefas-principal" ref={conteiner}>
          <div class="tarefas-topo">
            <h2>
              {listaSelecionada && <i class="bolinha grande" style={{ background: listaSelecionada.cor }} />}
              {titulo}
            </h2>
            {listaSelecionada && (
              <button class="botao-icone" aria-label="Editar lista" onClick={() => abrirPainel({ tipo: 'lista', id: listaSelecionada.id })}>
                <IconeLapis />
              </button>
            )}
          </div>

          <form class="adicionar-rapido" onSubmit={adicionar}>
            <IconeMais />
            <input
              class="campo"
              placeholder={`Adicionar tarefa em "${listaSelecionada?.nome ?? 'Geral'}"`}
              value={novoTitulo}
              onInput={(e) => setNovoTitulo(e.currentTarget.value)}
              enterKeyHint="done"
            />
          </form>

          {grupos.length === 0 && (
            <div class="vazio">
              <IconeTarefas />
              <strong>Nenhuma tarefa por aqui</strong>
              Digite acima para adicionar, ou toque no + para mais opções.
            </div>
          )}

          {grupos.map(({ grupo, tarefas }) => {
            const concluidas = grupo === 'concluidas';
            return (
              <div key={grupo} class={`grupo grupo-${grupo}`}>
                <button
                  class="grupo-titulo"
                  disabled={!concluidas}
                  onClick={() => concluidas && setMostrarConcluidas(!mostrarConcluidas)}
                >
                  {TITULO_GRUPO[grupo]} <span class="contagem">{tarefas.length}</span>
                  {concluidas && <span class="seta">{mostrarConcluidas ? '▾' : '▸'}</span>}
                </button>
                {(!concluidas || mostrarConcluidas) &&
                  tarefas.map((t) => (
                    <div
                      key={t.id}
                      class={arraste?.id === t.id ? 'arrastando' : undefined}
                      style={arraste?.id === t.id ? { transform: `translateY(${arraste.dy}px)` } : undefined}
                    >
                      <ItemTarefa
                        tarefa={t}
                        agora={agora}
                        lista={listaAtual ? undefined : (mapaListas.get(t.lista_id) as Lista | undefined)}
                        aoIniciarArraste={(e) => iniciarArraste(e, t, tarefas)}
                      />
                    </div>
                  ))}
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}

function BotaoLista(props: { rotulo: string; cor: string | null; contagem: number; ativa: boolean; aoClicar: () => void }) {
  return (
    <button class="lista-item" aria-current={props.ativa ? 'true' : undefined} onClick={props.aoClicar}>
      {props.cor ? <i class="bolinha" style={{ background: props.cor }} /> : <IconeLista />}
      <span class="lista-nome">{props.rotulo}</span>
      {props.contagem > 0 && <span class="contagem">{props.contagem}</span>}
    </button>
  );
}
