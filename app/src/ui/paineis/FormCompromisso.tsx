// Formulário de compromisso (painel lateral): criar, editar ocorrência/série, excluir.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Compromisso } from '../../dominio/tipos';
import {
  conflitos,
  expandirOcorrencias,
  externosComoOcorrencias,
  normalizarDiaInteiro,
  novoCompromisso,
  validarCompromisso,
  type Escopo,
  type Ocorrencia,
} from '../../dominio/compromissos';
import { deRRule, type Recorrencia } from '../../dominio/recorrencia';
import { diferencaMinutos, somarMinutos } from '../../dominio/datas';
import { novoId } from '../../dados/repositorio';
import { useAgendasExternas, useEntidade, useExternos } from '../../dados/ganchos';
import { carregarOcorrencia, ehDeSerie, excluirCompromisso, novaCategoria, salvarCategoria, salvarCompromisso } from '../acoes/compromissos';
import { useEstado, type OpcaoDialogo } from '../estado';
import { SeletorRecorrencia } from '../componentes/SeletorRecorrencia';
import { IconeAlerta, IconeFerias, IconeMais } from '../icones';
import { minhasFeriasEm } from '../../dominio/ferias';

const LEMBRETES: { min: number; rotulo: string }[] = [
  { min: 0, rotulo: 'Na hora' },
  { min: 10, rotulo: '10 min' },
  { min: 30, rotulo: '30 min' },
  { min: 60, rotulo: '1 hora' },
  { min: 1440, rotulo: '1 dia' },
];

const fmtHora = (dh: string) => dh.slice(11, 16);

interface Props {
  id?: string;
  data?: string;
  inicio?: string;
  fim?: string;
  dia_inteiro?: boolean;
}

export function FormCompromisso({ id, data, inicio, fim, dia_inteiro }: Props) {
  const { fecharPainel, avisar, perguntar, abrirPainel } = useEstado();
  const categorias = useEntidade('categorias').filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem);
  const todos = useEntidade('compromissos');
  const eventos = useEntidade('eventos');
  const externos = useExternos();
  const agendasExternas = useAgendasExternas();
  const [c, setC] = useState<Compromisso | null>(null);
  const [ocorrencia, setOcorrencia] = useState<Ocorrencia | null>(null);
  const [rec, setRec] = useState<Recorrencia | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [novaCat, setNovaCat] = useState<string | null>(null);
  const titulo = useRef<HTMLInputElement>(null);
  const novo = !id;

  useEffect(() => {
    (async () => {
      setErros([]);
      if (id) {
        const oc = await carregarOcorrencia(id, data);
        if (!oc) return fecharPainel();
        setOcorrencia(oc);
        setC({ ...oc.compromisso, inicio: oc.inicio, fim: oc.fim });
        const regra = oc.serie?.rrule ?? null;
        setRec(regra ? deRRule(regra) : null);
      } else {
        setOcorrencia(null);
        setRec(null);
        setC(novoCompromisso({ id: novoId(), inicio: inicio!, fim: fim!, dia_inteiro: !!dia_inteiro }));
        setTimeout(() => titulo.current?.focus(), 50);
      }
    })();
  }, [id, data, inicio, fim]);

  // RN12 — conflitos com outros compromissos no mesmo período
  const choques = useMemo(() => {
    if (!c || c.dia_inteiro || c.fim <= c.inicio) return [];
    const de = c.inicio.slice(0, 10);
    const ate = c.fim.slice(0, 10);
    const cores = new Map(agendasExternas.map((a) => [a.id, a.cor]));
    const visiveis = new Set(agendasExternas.map((a) => a.id));
    const doPeriodo = [
      ...expandirOcorrencias(todos, de, ate),
      // Eventos do Google (convites, reuniões) também contam como choque de horário; os marcados como "livre", não
      ...externosComoOcorrencias(externos.filter((x) => visiveis.has(x.agenda_id) && !x.livre), de, ate, cores),
    ];
    const propria = ocorrencia?.chave ?? c.id;
    return conflitos({ ...c, chave: propria }, doPeriodo).filter((o) => o.compromisso.id !== c.id || o.chave !== propria);
  }, [c, todos, ocorrencia, externos, agendasExternas]);

  if (!c) return null;
  const mudar = (parcial: Partial<Compromisso>) => setC({ ...c, ...parcial });
  // RN13 — compromisso durante minhas férias
  const feriasNoPeriodo = c.fim >= c.inicio ? minhasFeriasEm(eventos, c.inicio.slice(0, 10), c.fim.slice(0, 10)) : [];

  async function criarCategoria() {
    const nome = (novaCat ?? '').trim();
    if (!nome) return setNovaCat(null);
    const existente = categorias.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const cat = existente ?? { ...novaCategoria(categorias.length), nome };
    if (!existente) await salvarCategoria(cat);
    mudar({ categoria_id: cat.id });
    setNovaCat(null);
  }

  const deSerie = ehDeSerie(ocorrencia);
  const ehExcecao = deSerie && ocorrencia!.compromisso.id !== ocorrencia!.serie!.id;

  /** Mudar o início move o término junto (mantém a duração). */
  function mudarInicio(novaData: string, novaHora: string) {
    const novoInicio = `${novaData}T${novaHora || '00:00'}`;
    const duracao = Math.max(c!.dia_inteiro ? 0 : 15, diferencaMinutos(c!.inicio, c!.fim));
    mudar({ inicio: novoInicio, fim: somarMinutos(novoInicio, duracao) });
  }

  async function escolherEscopo(acao: 'salvar' | 'excluir'): Promise<Escopo | null | undefined> {
    if (!deSerie) return null;
    const opcoes: OpcaoDialogo<Escopo>[] = [
      { valor: 'esta', rotulo: 'Só esta ocorrência' },
      { valor: 'seguintes', rotulo: 'Esta e as seguintes' },
      { valor: 'todas', rotulo: 'Todas as ocorrências', estilo: acao === 'excluir' ? 'perigo' : undefined },
    ];
    const r = await perguntar(acao === 'salvar' ? 'Alterar compromisso recorrente' : 'Excluir compromisso recorrente', opcoes);
    return r ?? undefined; // undefined = cancelou
  }

  async function salvar(e?: Event) {
    e?.preventDefault();
    const final = normalizarDiaInteiro({ ...c!, titulo: c!.titulo.trim() });
    const problemas = validarCompromisso(final);
    setErros(problemas);
    if (problemas.length) return;
    const escopo = await escolherEscopo('salvar');
    if (escopo === undefined) return;
    const desfazer = await salvarCompromisso(final, rec, ocorrencia, escopo);
    fecharPainel();
    avisar({ texto: novo ? 'Compromisso criado' : 'Compromisso salvo', desfazer });
  }

  async function excluir() {
    const escopo = await escolherEscopo('excluir');
    if (escopo === undefined) return;
    const desfazer = await excluirCompromisso(ocorrencia!, escopo);
    fecharPainel();
    avisar({ texto: 'Compromisso excluído', desfazer });
  }

  const dataIni = c.inicio.slice(0, 10);
  const dataFim = c.fim.slice(0, 10);

  return (
    <form class="formulario" onSubmit={salvar}>
      <input
        ref={titulo}
        class="campo campo-titulo"
        placeholder="Título do compromisso"
        value={c.titulo}
        onInput={(e) => mudar({ titulo: e.currentTarget.value })}
        enterKeyHint="done"
      />
      <input class="campo" placeholder="Local (opcional)" value={c.local} onInput={(e) => mudar({ local: e.currentTarget.value })} />

      {ehExcecao && <p class="dica">Esta ocorrência já foi alterada separadamente da série.</p>}

      <fieldset>
        <legend>Quando</legend>
        <label class="interruptor">
          <input
            type="checkbox"
            checked={c.dia_inteiro}
            onChange={(e) => {
              const diaInteiro = e.currentTarget.checked;
              if (diaInteiro) mudar({ dia_inteiro: true, fim: `${dataFim}T23:59` });
              else mudar({ dia_inteiro: false, inicio: `${dataIni}T09:00`, fim: `${dataIni}T10:00` });
            }}
          />
          <span>Dia inteiro</span>
        </label>
        <div class="linha">
          <span class="rotulo-linha">Início</span>
          <input type="date" class="campo" value={dataIni} onInput={(e) => e.currentTarget.value && mudarInicio(e.currentTarget.value, fmtHora(c.inicio))} />
          {!c.dia_inteiro && (
            <input type="time" class="campo" value={fmtHora(c.inicio)} onInput={(e) => e.currentTarget.value && mudarInicio(dataIni, e.currentTarget.value)} />
          )}
        </div>
        <div class="linha">
          <span class="rotulo-linha">Término</span>
          <input
            type="date"
            class="campo"
            value={dataFim}
            min={dataIni}
            onInput={(e) => e.currentTarget.value && mudar({ fim: `${e.currentTarget.value}T${fmtHora(c.fim)}` })}
          />
          {!c.dia_inteiro && (
            <input type="time" class="campo" value={fmtHora(c.fim)} onInput={(e) => e.currentTarget.value && mudar({ fim: `${dataFim}T${e.currentTarget.value}` })} />
          )}
        </div>
      </fieldset>

      {choques.length > 0 && (
        <div class="alerta" role="status">
          <IconeAlerta />
          <div>
            <strong>Choque de horário</strong>
            {choques.slice(0, 3).map((o) => (
              <span key={o.chave}>
                {fmtHora(o.inicio)}–{fmtHora(o.fim)} · {o.compromisso.titulo}
                {o.externo && ' (Google Agenda)'}
              </span>
            ))}
            {choques.length > 3 && <span>e mais {choques.length - 3}</span>}
          </div>
        </div>
      )}

      {feriasNoPeriodo.length > 0 && (
        <div class="alerta" role="status">
          <IconeFerias />
          <div>
            <strong>Você estará de férias</strong>
            {feriasNoPeriodo.map((f) => (
              <span key={f.id}>
                {f.titulo || 'Minhas férias'}: {f.data_inicio.slice(8)}/{f.data_inicio.slice(5, 7)} a {f.data_fim.slice(8)}/{f.data_fim.slice(5, 7)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!ehExcecao && (
        <fieldset>
          <legend>Repetir</legend>
          <SeletorRecorrencia valor={rec} inicio={c.inicio} aoMudar={setRec} />
        </fieldset>
      )}

      <fieldset>
        <legend>Categoria</legend>
        <div class="chips">
          <button type="button" class="chip" aria-pressed={!c.categoria_id} onClick={() => mudar({ categoria_id: null })}>
            Nenhuma
          </button>
          {categorias.map((cat) => (
            <button key={cat.id} type="button" class="chip" aria-pressed={c.categoria_id === cat.id} onClick={() => mudar({ categoria_id: cat.id })}>
              <i class="bolinha" style={{ background: cat.cor }} />
              {cat.nome}
            </button>
          ))}
          {novaCat === null ? (
            <button type="button" class="chip fantasma" onClick={() => setNovaCat('')}>
              <IconeMais width={18} height={18} /> Nova
            </button>
          ) : (
            <span class="linha">
              <input
                class="campo"
                style={{ width: 180 }}
                placeholder="Nome"
                value={novaCat}
                autoFocus
                onInput={(e) => setNovaCat(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), criarCategoria())}
              />
              <button type="button" class="botao" onClick={criarCategoria}>OK</button>
            </span>
          )}
        </div>
        {categorias.find((x) => x.id === c.categoria_id)?.privada && (
          <p class="dica">🔒 Categoria privada: no Google Agenda, os outros verão só "ocupado".</p>
        )}
        {categorias.length > 0 && (
          <button type="button" class="link esquerda" onClick={() => abrirPainel({ tipo: 'categoria', id: c.categoria_id ?? categorias[0].id })}>
            Editar categorias
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Lembretes</legend>
        <div class="chips">
          {LEMBRETES.map((l) => {
            const ativo = c.lembretes.includes(l.min);
            return (
              <button
                key={l.min}
                type="button"
                class="chip"
                aria-pressed={ativo}
                onClick={() => mudar({ lembretes: ativo ? c.lembretes.filter((x) => x !== l.min) : [...c.lembretes, l.min].sort((a, b) => a - b) })}
              >
                {l.rotulo}
              </button>
            );
          })}
        </div>
        <p class="dica">Os avisos tocam pelo Google Agenda (no tablet e no celular).</p>
      </fieldset>

      <textarea class="campo" rows={3} placeholder="Observações (opcional)" value={c.descricao} onInput={(e) => mudar({ descricao: e.currentTarget.value })} />

      <label class="interruptor">
        <input type="checkbox" checked={c.sync_google} onChange={(e) => mudar({ sync_google: e.currentTarget.checked })} />
        <span>Enviar ao Google Agenda</span>
      </label>

      {erros.length > 0 && (
        <ul class="erros" role="alert">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div class="acoes-form">
        <button type="submit" class="botao primario">{novo ? 'Criar compromisso' : 'Salvar'}</button>
        {!novo && (
          <button type="button" class="botao perigo" onClick={excluir}>Excluir</button>
        )}
      </div>
    </form>
  );
}
