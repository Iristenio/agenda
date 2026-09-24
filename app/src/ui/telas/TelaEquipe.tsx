// Tela Equipe: pessoas à esquerda; linha do tempo de férias e próximos aniversários à direita.
import { useMemo, useState } from 'preact/hooks';
import type { Evento, Pessoa } from '../../dominio/tipos';
import { aniversariosEntre, descreverAniversario, iniciais, nomeExibicao, proximoAniversario } from '../../dominio/pessoas';
import { diasAcimaDoLimite, diasCorridos, eventosEntre, tituloEvento } from '../../dominio/ferias';
import { deDataISO, diaDaSemana, hojeISO, inicioDoMes, somarDias, somarMeses } from '../../dominio/datas';
import { salvarConfig } from '../../dados/repositorio';
import { useAgora, useConfig, useEntidade } from '../../dados/ganchos';
import { useEstado } from '../estado';
import { IconeBolo, IconeEquipe, IconeFerias, IconeMais } from '../icones';
import { COR_EU, COR_OUTRO } from '../calendario/comum';

const fmtMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function TelaEquipe() {
  const { abrirPainel } = useEstado();
  const hoje = hojeISO(useAgora());
  const pessoasTodas = useEntidade('pessoas');
  const [mostrarInativas, setMostrarInativas] = useState(false);

  const ordenar = (a: Pessoa, b: Pessoa) => nomeExibicao(a).localeCompare(nomeExibicao(b));
  const ativas = pessoasTodas.filter((p) => p.ativo);
  const equipe = ativas.filter((p) => p.da_equipe).sort(ordenar);
  const outras = ativas.filter((p) => !p.da_equipe).sort(ordenar);
  const inativas = pessoasTodas.filter((p) => !p.ativo).sort(ordenar);

  return (
    <>
      <header class="cabecalho">
        <h1>Equipe</h1>
      </header>
      <div class="equipe-layout">
        <nav class="pessoas" aria-label="Pessoas">
          {pessoasTodas.length === 0 && (
            <div class="vazio">
              <IconeEquipe />
              <strong>Ninguém cadastrado</strong>
              Cadastre a equipe, familiares e amigos para acompanhar aniversários e férias.
            </div>
          )}
          {equipe.length > 0 && <h3 class="pessoas-titulo">Equipe</h3>}
          {equipe.map((p) => <ItemPessoa key={p.id} p={p} hoje={hoje} />)}
          {outras.length > 0 && <h3 class="pessoas-titulo">Outros contatos</h3>}
          {outras.map((p) => <ItemPessoa key={p.id} p={p} hoje={hoje} />)}
          {inativas.length > 0 && (
            <button class="pessoas-titulo botao-texto" onClick={() => setMostrarInativas(!mostrarInativas)}>
              Inativos ({inativas.length}) {mostrarInativas ? '▾' : '▸'}
            </button>
          )}
          {mostrarInativas && inativas.map((p) => <ItemPessoa key={p.id} p={p} hoje={hoje} />)}
          <button class="lista-item nova" onClick={() => abrirPainel({ tipo: 'pessoa' })}>
            <IconeMais />
            Nova pessoa
          </button>
        </nav>

        <div class="equipe-principal">
          <LinhaDoTempo equipe={equipe} hoje={hoje} />
          <ProximosAniversarios pessoas={ativas} hoje={hoje} />
        </div>
      </div>
    </>
  );
}

function Avatar({ p }: { p: Pessoa }) {
  return (
    <span class="avatar" style={{ background: p.cor }} aria-hidden="true">
      {iniciais(p)}
    </span>
  );
}

function ItemPessoa({ p, hoje }: { p: Pessoa; hoje: string }) {
  const { abrirPainel } = useEstado();
  const prox = p.ativo && p.data_nascimento ? proximoAniversario(p, hoje) : null;
  return (
    <button class={`pessoa-item${p.ativo ? '' : ' inativa'}`} onClick={() => abrirPainel({ tipo: 'pessoa', id: p.id })}>
      <Avatar p={p} />
      <span class="pessoa-texto">
        <strong>{nomeExibicao(p)}</strong>
        <small>
          {p.cargo}
          {p.cargo && prox && ' · '}
          {prox && `🎂 ${fmtDiaMes.format(deDataISO(prox.data)).replace('.', '')}`}
        </small>
      </span>
    </button>
  );
}

/* ---------------- Linha do tempo (estilo Gantt, por mês) ---------------- */

interface Linha {
  chave: string;
  rotulo: string;
  cor: string;
  pessoa: Pessoa | null;
  eventos: Evento[];
}

function LinhaDoTempo({ equipe, hoje }: { equipe: Pessoa[]; hoje: string }) {
  const { abrirPainel } = useEstado();
  const config = useConfig();
  const eventosTodos = useEntidade('eventos');
  const pessoasTodas = useEntidade('pessoas');
  const [mes, setMes] = useState(() => inicioDoMes(hoje));

  const fimMes = somarDias(somarMeses(mes, 1), -1);
  const dias = useMemo(() => {
    const lista: string[] = [];
    for (let d = mes; d <= fimMes; d = somarDias(d, 1)) lista.push(d);
    return lista;
  }, [mes, fimMes]);
  const mapaPessoas = useMemo(() => new Map(pessoasTodas.map((p) => [p.id, p])), [pessoasTodas]);
  const doMes = eventosEntre(eventosTodos, mes, fimMes);
  const lotados = new Set(diasAcimaDoLimite(eventosTodos, config.limite_ausentes_equipe, mes, fimMes).map((d) => d.dia));

  // Linhas: eu, a equipe e quem mais tiver período no mês
  const linhas: Linha[] = [{ chave: 'eu', rotulo: 'Você', cor: COR_EU, pessoa: null, eventos: [] }];
  const porPessoa = new Map<string, Linha>();
  for (const p of equipe) {
    const l = { chave: p.id, rotulo: nomeExibicao(p), cor: p.cor, pessoa: p, eventos: [] };
    porPessoa.set(p.id, l);
    linhas.push(l);
  }
  for (const e of doMes) {
    if (e.tipo === 'ferias_pessoais' || !e.pessoa_id) {
      linhas[0].eventos.push(e);
      continue;
    }
    if (!porPessoa.has(e.pessoa_id)) {
      const p = mapaPessoas.get(e.pessoa_id);
      const l = { chave: e.pessoa_id, rotulo: p ? nomeExibicao(p) : '?', cor: p?.cor ?? '#697386', pessoa: p ?? null, eventos: [] };
      porPessoa.set(e.pessoa_id, l);
      linhas.push(l);
    }
    porPessoa.get(e.pessoa_id)!.eventos.push(e);
  }

  const novo = (linha: Linha, dia: string) =>
    abrirPainel({
      tipo: 'evento',
      data: dia,
      tipo_evento: linha.chave === 'eu' ? 'ferias_pessoais' : 'ferias_equipe',
      pessoa_id: linha.pessoa?.id,
    });

  const coluna = (d: string) => Math.round((deDataISO(d).getTime() - deDataISO(mes).getTime()) / 86_400_000) + 2;

  return (
    <section class="cartao linha-tempo-cartao">
      <div class="cartao-topo">
        <h2>
          <IconeFerias /> Férias
        </h2>
        <div class="navegacao">
          <button class="botao-icone" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>‹</button>
          <span class="mes-rotulo">{fmtMesAno.format(deDataISO(mes))}</span>
          <button class="botao-icone" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}>›</button>
        </div>
        <label class="limite">
          Alertar com mais de
          <select
            class="campo"
            value={config.limite_ausentes_equipe}
            onChange={(e) => salvarConfig({ limite_ausentes_equipe: Number(e.currentTarget.value) })}
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          ausentes
        </label>
      </div>

      <div class="gantt-rolagem">
        <div class="gantt" style={{ '--dias': dias.length }}>
          <div class="gantt-linha gantt-cabecalho">
            <span class="gantt-nome" />
            {dias.map((d) => {
              const s = diaDaSemana(d);
              return (
                <span
                  key={d}
                  class={`gantt-dia${s === 0 || s === 6 ? ' fds' : ''}${d === hoje ? ' hoje' : ''}${lotados.has(d) ? ' lotado' : ''}`}
                  title={lotados.has(d) ? 'Ausentes acima do limite' : undefined}
                >
                  <small>{LETRAS[s]}</small>
                  {Number(d.slice(8))}
                </span>
              );
            })}
          </div>

          {linhas.map((linha) => (
            <div key={linha.chave} class="gantt-linha">
              <span class="gantt-nome">
                <i class="bolinha" style={{ background: linha.cor }} />
                {linha.rotulo}
              </span>
              {dias.map((d) => {
                const s = diaDaSemana(d);
                return (
                  <button
                    key={d}
                    class={`gantt-celula${s === 0 || s === 6 ? ' fds' : ''}${d === hoje ? ' hoje' : ''}`}
                    style={{ gridColumn: coluna(d) }}
                    aria-label={`Nova férias para ${linha.rotulo} em ${d}`}
                    onClick={() => novo(linha, d)}
                  />
                );
              })}
              {linha.eventos.map((e) => {
                const ini = e.data_inicio < mes ? mes : e.data_inicio;
                const fim = e.data_fim > fimMes ? fimMes : e.data_fim;
                const cor = e.tipo === 'outro' ? COR_OUTRO : linha.cor;
                return (
                  <button
                    key={e.id}
                    class={`gantt-barra${e.tipo === 'outro' ? ' outro' : ''}${e.data_inicio < mes ? ' continua-antes' : ''}${e.data_fim > fimMes ? ' continua-depois' : ''}`}
                    style={{ gridColumn: `${coluna(ini)} / ${coluna(fim) + 1}`, '--cor': cor }}
                    onClick={() => abrirPainel({ tipo: 'evento', id: e.id })}
                    title={tituloEvento(e, mapaPessoas)}
                  >
                    {e.tipo === 'outro' ? tituloEvento(e, mapaPessoas) : `${diasCorridos(e.data_inicio, e.data_fim)} dias`}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {equipe.length === 0 && (
        <p class="dica">Cadastre pessoas marcando "Faz parte da equipe" para que apareçam aqui. Toque num dia para marcar férias.</p>
      )}
      {lotados.size > 0 && <p class="dica aviso-texto">Dias em vermelho têm mais de {config.limite_ausentes_equipe} pessoas de férias.</p>}
    </section>
  );
}

/* ---------------- Próximos aniversários ---------------- */

function ProximosAniversarios({ pessoas, hoje }: { pessoas: Pessoa[]; hoje: string }) {
  const { abrirPainel } = useEstado();
  const lista = aniversariosEntre(pessoas, hoje, somarDias(hoje, 90));
  return (
    <section class="cartao">
      <h2>
        <IconeBolo /> Próximos aniversários <small class="sub-cartao">90 dias</small>
      </h2>
      {lista.length === 0 ? (
        <p class="dica">Nenhum aniversário nos próximos 90 dias.</p>
      ) : (
        <div class="aniversarios">
          {lista.map((a) => (
            <button key={a.pessoa.id + a.data} class={`aniversario${a.data === hoje ? ' hoje' : ''}`} onClick={() => abrirPainel({ tipo: 'pessoa', id: a.pessoa.id })}>
              <span class="aniversario-data">
                <strong>{Number(a.data.slice(8))}</strong>
                <small>{fmtDiaMes.format(deDataISO(a.data)).split(' ').pop()?.replace('.', '')}</small>
              </span>
              <Avatar p={a.pessoa} />
              <span class="pessoa-texto">
                <strong>{nomeExibicao(a.pessoa)}</strong>
                <small>{descreverAniversario(a, hoje)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
