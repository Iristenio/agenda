// Formulário de férias / período: tipo, pessoa, datas, contagem de dias e alertas.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Evento, TipoEvento } from '../../dominio/tipos';
import {
  agruparDias,
  diasAcimaDoLimite,
  diasCorridos,
  diasUteis,
  novoEvento,
  sobreposicoesMesmaPessoa,
  tituloEvento,
  validarEvento,
} from '../../dominio/ferias';
import { nomeExibicao } from '../../dominio/pessoas';
import { hojeISO, somarDias } from '../../dominio/datas';
import { buscar, novoId } from '../../dados/repositorio';
import { useConfig, useEntidade } from '../../dados/ganchos';
import { excluirEvento, salvarEvento } from '../acoes/pessoas';
import { useEstado } from '../estado';
import { IconeAlerta } from '../icones';

const TIPOS: { valor: TipoEvento; rotulo: string }[] = [
  { valor: 'ferias_pessoais', rotulo: 'Minhas férias' },
  { valor: 'ferias_equipe', rotulo: 'Férias da equipe' },
  { valor: 'outro', rotulo: 'Outro período' },
];

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

interface Props {
  id?: string;
  tipo_evento?: TipoEvento;
  pessoa_id?: string;
  data?: string;
}

export function FormEvento({ id, tipo_evento, pessoa_id, data }: Props) {
  const { fecharPainel, avisar } = useEstado();
  const config = useConfig();
  const eventos = useEntidade('eventos');
  const pessoasTodas = useEntidade('pessoas');
  const pessoas = pessoasTodas.filter((p) => p.ativo).sort((a, b) => nomeExibicao(a).localeCompare(nomeExibicao(b)));
  const mapaPessoas = useMemo(() => new Map(pessoasTodas.map((p) => [p.id, p])), [pessoasTodas]);
  const [e, setE] = useState<Evento | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const novo = !id;

  useEffect(() => {
    (async () => {
      const existente = id ? await buscar('eventos', id) : undefined;
      const inicio = data ?? hojeISO();
      setE(
        existente ??
          novoEvento({
            id: novoId(),
            tipo: tipo_evento ?? 'ferias_pessoais',
            pessoa_id: pessoa_id ?? null,
            data_inicio: inicio,
            data_fim: somarDias(inicio, tipo_evento === 'outro' ? 0 : 13),
          }),
      );
      setErros([]);
    })();
  }, [id, tipo_evento, pessoa_id, data]);

  const alertas = useMemo(() => {
    if (!e || e.data_fim < e.data_inicio) return { sobrepostas: [], lotados: [] };
    const outros = eventos.filter((x) => x.id !== e.id);
    return {
      sobrepostas: sobreposicoesMesmaPessoa(e, outros),
      lotados: agruparDias(diasAcimaDoLimite([...outros, e], config.limite_ausentes_equipe, e.data_inicio, e.data_fim).map((d) => d.dia)),
    };
  }, [e, eventos, config.limite_ausentes_equipe]);

  if (!e) return null;
  const mudar = (parcial: Partial<Evento>) => setE({ ...e, ...parcial });
  const ehFerias = e.tipo !== 'outro';
  const opcoesPessoa = e.tipo === 'ferias_equipe' ? pessoas.filter((p) => p.da_equipe || p.id === e.pessoa_id) : pessoas;

  async function salvar(ev: Event) {
    ev.preventDefault();
    const final = { ...e!, titulo: e!.titulo.trim(), pessoa_id: e!.tipo === 'ferias_pessoais' ? null : e!.pessoa_id };
    const problemas = validarEvento(final);
    setErros(problemas);
    if (problemas.length) return;
    const desfazer = await salvarEvento(final);
    fecharPainel();
    avisar({ texto: novo ? `Período cadastrado: ${tituloEvento(final, mapaPessoas)}` : 'Período salvo', desfazer });
  }

  async function excluir() {
    const desfazer = await excluirEvento(e!);
    fecharPainel();
    avisar({ texto: 'Período excluído', desfazer });
  }

  const valido = e.data_fim >= e.data_inicio;

  return (
    <form class="formulario" onSubmit={salvar}>
      <div class="segmentado" role="radiogroup" aria-label="Tipo">
        {TIPOS.map((t) => (
          <button key={t.valor} type="button" role="radio" aria-checked={e.tipo === t.valor} onClick={() => mudar({ tipo: t.valor })}>
            {t.rotulo}
          </button>
        ))}
      </div>

      {e.tipo !== 'ferias_pessoais' && (
        <fieldset>
          <legend>{e.tipo === 'ferias_equipe' ? 'Quem' : 'Pessoa (opcional)'}</legend>
          {opcoesPessoa.length === 0 ? (
            <p class="dica">Cadastre as pessoas da equipe primeiro (botão + → Pessoa).</p>
          ) : (
            <div class="chips">
              {e.tipo === 'outro' && (
                <button type="button" class="chip" aria-pressed={!e.pessoa_id} onClick={() => mudar({ pessoa_id: null })}>
                  Ninguém
                </button>
              )}
              {opcoesPessoa.map((p) => (
                <button key={p.id} type="button" class="chip" aria-pressed={e.pessoa_id === p.id} onClick={() => mudar({ pessoa_id: p.id })}>
                  <i class="bolinha" style={{ background: p.cor }} />
                  {nomeExibicao(p)}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <input
        class="campo"
        placeholder={e.tipo === 'outro' ? 'Nome do período (ex.: Congresso, Licença)' : `Título (opcional) — "${tituloEvento({ ...e, titulo: '' }, mapaPessoas)}"`}
        value={e.titulo}
        onInput={(x) => mudar({ titulo: x.currentTarget.value })}
      />

      <fieldset>
        <legend>Período</legend>
        <div class="linha">
          <span class="rotulo-linha">De</span>
          <input
            type="date"
            class="campo"
            value={e.data_inicio}
            onInput={(x) => {
              const v = x.currentTarget.value;
              if (!v) return;
              // Mantém a duração ao mudar o início
              const duracao = Math.max(0, diasCorridos(e.data_inicio, e.data_fim) - 1);
              mudar({ data_inicio: v, data_fim: somarDias(v, duracao) });
            }}
          />
        </div>
        <div class="linha">
          <span class="rotulo-linha">Até</span>
          <input type="date" class="campo" value={e.data_fim} min={e.data_inicio} onInput={(x) => x.currentTarget.value && mudar({ data_fim: x.currentTarget.value })} />
        </div>
        {valido && (
          <div class="contagem-dias">
            <span><strong>{diasCorridos(e.data_inicio, e.data_fim)}</strong> dias corridos</span>
            <span><strong>{diasUteis(e.data_inicio, e.data_fim)}</strong> dias úteis</span>
          </div>
        )}
        <div class="chips">
          {[10, 15, 20, 30].map((n) => (
            <button key={n} type="button" class="chip" aria-pressed={diasCorridos(e.data_inicio, e.data_fim) === n} onClick={() => mudar({ data_fim: somarDias(e.data_inicio, n - 1) })}>
              {n} dias
            </button>
          ))}
        </div>
      </fieldset>

      {ehFerias && alertas.sobrepostas.length > 0 && (
        <div class="alerta" role="status">
          <IconeAlerta />
          <div>
            <strong>Períodos sobrepostos</strong>
            {alertas.sobrepostas.map((x) => (
              <span key={x.id}>
                {tituloEvento(x, mapaPessoas)}: {fmt(x.data_inicio)} a {fmt(x.data_fim)}
              </span>
            ))}
          </div>
        </div>
      )}
      {ehFerias && alertas.lotados.length > 0 && (
        <div class="alerta" role="status">
          <IconeAlerta />
          <div>
            <strong>Mais de {config.limite_ausentes_equipe} pessoas ausentes</strong>
            {alertas.lotados.slice(0, 4).map((g) => (
              <span key={g.de}>{g.de === g.ate ? fmt(g.de) : `${fmt(g.de)} a ${fmt(g.ate)}`}</span>
            ))}
          </div>
        </div>
      )}

      <textarea class="campo" rows={2} placeholder="Observações (opcional)" value={e.observacoes} onInput={(x) => mudar({ observacoes: x.currentTarget.value })} />

      <label class="interruptor">
        <input type="checkbox" checked={e.sync_google} onChange={(x) => mudar({ sync_google: x.currentTarget.checked })} />
        <span>Enviar ao Google Agenda <small>(a partir da etapa 5)</small></span>
      </label>

      {erros.length > 0 && (
        <ul class="erros" role="alert">
          {erros.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}

      <div class="acoes-form">
        <button type="submit" class="botao primario">{novo ? 'Cadastrar' : 'Salvar'}</button>
        {!novo && <button type="button" class="botao perigo" onClick={excluir}>Excluir</button>}
      </div>
    </form>
  );
}
