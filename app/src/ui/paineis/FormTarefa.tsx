// Formulário de tarefa (painel lateral): criar e editar.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Prioridade, Tarefa } from '../../dominio/tipos';
import { novaTarefa, proximoPrazo, validarTarefa } from '../../dominio/tarefas';
import { diaUtilDoMes } from '../../dominio/feriados';
import { deRRule, ehDiaUtilDoMes, paraRRule, primeiraOcorrencia, type Recorrencia } from '../../dominio/recorrencia';
import { hojeISO, somarDias } from '../../dominio/datas';
import { buscar, LISTA_PADRAO_ID, novoId } from '../../dados/repositorio';
import { useEntidade, useFeriados } from '../../dados/ganchos';
import { alternarConclusao, excluirTarefa, salvarTarefa } from '../acoes/tarefas';
import { useEstado } from '../estado';
import { SeletorRecorrencia } from '../componentes/SeletorRecorrencia';
import { CampoHora } from '../componentes/CampoHora';

const PRIORIDADES: { valor: Prioridade; rotulo: string }[] = [
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'baixa', rotulo: 'Baixa' },
];

export function FormTarefa({ id, lista_id }: { id?: string; lista_id?: string }) {
  const { fecharPainel, avisar } = useEstado();
  const listas = useEntidade('listas').filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem);
  const [t, setT] = useState<Tarefa | null>(null);
  const [rec, setRec] = useState<Recorrencia | null>(null);
  const [recAlterada, setRecAlterada] = useState(false);
  const [prazoAjustado, setPrazoAjustado] = useState(false);
  const inicioFeriados = hojeISO();
  const feriadosProximos = useFeriados(somarDias(inicioFeriados, -31), somarDias(inicioFeriados, 460));
  const [erros, setErros] = useState<string[]>([]);
  const titulo = useRef<HTMLInputElement>(null);
  const nova = !id;

  useEffect(() => {
    (async () => {
      const existente = id ? await buscar('tarefas', id) : undefined;
      const base = existente ?? novaTarefa({ id: novoId(), lista_id: lista_id ?? LISTA_PADRAO_ID });
      setT(base);
      setRec(base.rrule ? deRRule(base.rrule) : null);
      setRecAlterada(false);
      setErros([]);
      if (!existente) setTimeout(() => titulo.current?.focus(), 50);
    })();
  }, [id, lista_id]);

  if (!t) return null;
  const mudar = (parcial: Partial<Tarefa>) => setT({ ...t, ...parcial });
  const hoje = hojeISO();
  const feriados = feriadosProximos;

  /** Próximo "primeiro/último dia útil" a partir de `base`, pulando feriados (RN44). */
  function alinharDiaUtil(r: Recorrencia, base: string): string {
    const modo = r.mensal_modo as 'primeiro_util' | 'ultimo_util';
    const ajustada = diaUtilDoMes(primeiraOcorrencia(r, base), modo, feriados);
    if (ajustada >= base) return ajustada;
    return proximoPrazo(paraRRule(r, base), base, feriados) ?? ajustada; // o dia útil deste mês já passou
  }

  function mudarRecorrencia(r: Recorrencia | null) {
    setRec(r);
    setRecAlterada(true);
    setPrazoAjustado(false);
    if (!r) return;
    const base = t!.prazo ?? hoje; // recorrente precisa de prazo
    // "Primeiro/último dia útil": o prazo passa a ser o próximo dia que a regra gera
    const alinhado = ehDiaUtilDoMes(r) ? alinharDiaUtil(r, base) : base;
    if (alinhado !== t!.prazo) {
      mudar({ prazo: alinhado });
      setPrazoAjustado(ehDiaUtilDoMes(r) && alinhado !== base);
    }
  }

  async function salvar(e?: Event) {
    e?.preventDefault();
    const original = id ? await buscar('tarefas', id) : undefined;
    // Só recria a regra se a recorrência ou o prazo mudaram (preserva a contagem de uma série em andamento)
    const prazoMudou = original?.prazo !== t!.prazo;
    const rrule = rec && t!.prazo ? (recAlterada || prazoMudou || !t!.rrule ? paraRRule(rec, t!.prazo) : t!.rrule) : null;
    const final = { ...t!, titulo: t!.titulo.trim(), rrule };
    const problemas = validarTarefa(final);
    setErros(problemas);
    if (problemas.length) return;
    await salvarTarefa(final);
    fecharPainel();
    avisar({ texto: nova ? 'Tarefa criada' : 'Tarefa salva' });
  }

  async function excluir() {
    const desfazer = await excluirTarefa(t!);
    fecharPainel();
    avisar({ texto: 'Tarefa excluída', desfazer });
  }

  async function concluir() {
    const r = await alternarConclusao(t!);
    fecharPainel();
    avisar(r);
  }

  return (
    <form class="formulario" onSubmit={salvar}>
      <input
        ref={titulo}
        class="campo campo-titulo"
        placeholder="O que precisa ser feito?"
        value={t.titulo}
        onInput={(e) => mudar({ titulo: e.currentTarget.value })}
        enterKeyHint="done"
      />
      <textarea
        class="campo"
        rows={3}
        placeholder="Detalhes (opcional)"
        value={t.descricao}
        onInput={(e) => mudar({ descricao: e.currentTarget.value })}
      />

      <fieldset>
        <legend>Prioridade</legend>
        <div class="segmentado prioridades" role="radiogroup">
          {PRIORIDADES.map((p) => (
            <button key={p.valor} type="button" role="radio" class={`p-${p.valor}`} aria-checked={t.prioridade === p.valor} onClick={() => mudar({ prioridade: p.valor })}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Prazo</legend>
        <div class="chips">
          {[
            ['Hoje', hoje],
            ['Amanhã', somarDias(hoje, 1)],
            ['Em 1 semana', somarDias(hoje, 7)],
          ].map(([rotulo, data]) => (
            <button key={rotulo} type="button" class="chip" aria-pressed={t.prazo === data} onClick={() => mudar({ prazo: data })}>
              {rotulo}
            </button>
          ))}
          <button type="button" class="chip" aria-pressed={!t.prazo} onClick={() => { mudar({ prazo: null, prazo_hora: null }); setRec(null); }}>
            Sem prazo
          </button>
        </div>
        <div class="linha">
          <input type="date" class="campo" value={t.prazo ?? ''} onInput={(e) => mudar({ prazo: e.currentTarget.value || null })} />
          {t.prazo && (
            <CampoHora valor={t.prazo_hora} aoMudar={(h) => mudar({ prazo_hora: h })} rotulo="Hora do prazo (opcional)" opcional placeholder="Sem hora" />
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Repetir</legend>
        <SeletorRecorrencia valor={rec} inicio={t.prazo ?? hoje} aoMudar={mudarRecorrencia} />
        {prazoAjustado && t.prazo && (
          <p class="dica">📅 Prazo ajustado para {t.prazo.split('-').reverse().join('/')}, o próximo dia que segue essa regra.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Lista</legend>
        <div class="chips">
          {listas.map((l) => (
            <button key={l.id} type="button" class="chip" aria-pressed={t.lista_id === l.id} onClick={() => mudar({ lista_id: l.id })}>
              <i class="bolinha" style={{ background: l.cor }} />
              {l.nome}
            </button>
          ))}
        </div>
      </fieldset>

      {!nova && t.status !== 'concluida' && (
        <label class="interruptor">
          <input type="checkbox" checked={t.status === 'andamento'} onChange={(e) => mudar({ status: e.currentTarget.checked ? 'andamento' : 'pendente' })} />
          <span>Em andamento</span>
        </label>
      )}

      <label class="interruptor">
        <input type="checkbox" checked={t.sync_google} onChange={(e) => mudar({ sync_google: e.currentTarget.checked })} />
        <span>Enviar ao Google Tasks</span>
      </label>

      {erros.length > 0 && (
        <ul class="erros" role="alert">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div class="acoes-form">
        <button type="submit" class="botao primario">{nova ? 'Criar tarefa' : 'Salvar'}</button>
        {!nova && (
          <button type="button" class="botao" onClick={concluir}>
            {t.status === 'concluida' ? 'Reabrir' : 'Concluir'}
          </button>
        )}
        {!nova && (
          <button type="button" class="botao perigo" onClick={excluir}>Excluir</button>
        )}
      </div>
    </form>
  );
}
