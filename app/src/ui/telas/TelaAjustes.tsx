// Tela Ajustes: conexão com o Google, preferências e informações do aparelho.
import { useEffect, useState } from 'preact/hooks';
import type { AgendaGoogle, Config } from '../../dominio/tipos';
import { salvarConfig } from '../../dados/repositorio';
import { useAgendasExternas, useConfig } from '../../dados/ganchos';
import {
  baixarTudo,
  conectar,
  definirAgendasExternas,
  desconectar,
  ErroApi,
  listarAgendasGoogle,
  sincronizar,
} from '../../sync/motor';
import { descreverUltimaSync, ROTULO_STATUS, useSync } from '../../sync/ganchos';
import { useEstado } from '../estado';

export function TelaAjustes() {
  return (
    <>
      <header class="cabecalho">
        <h1>Ajustes</h1>
      </header>
      <div class="conteudo ajustes">
        <CartaoGoogle />
        <CartaoAgendasExternas />
        <CartaoPreferencias />
        <CartaoAparelho />
      </div>
    </>
  );
}

/* ---------------- Conexão com o Google ---------------- */

function CartaoGoogle() {
  const sync = useSync();
  const { avisar, perguntar } = useEstado();
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [, forcarRelogio] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forcarRelogio((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function aoConectar(e: Event) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      await conectar(codigo);
      setCodigo('');
      avisar({ texto: 'Conectado ao Google! Seus dados estão sendo enviados à planilha.' });
    } catch (x) {
      setErro(x instanceof ErroApi ? x.message : 'Não foi possível conectar.');
    } finally {
      setOcupado(false);
    }
  }

  async function aoDesconectar() {
    const r = await perguntar(
      'Desconectar deste aparelho?',
      [{ valor: 'sim', rotulo: 'Desconectar', estilo: 'perigo' }],
      'Os dados continuam aqui e na planilha. Alterações feitas depois ficarão só neste aparelho até conectar de novo.',
    );
    if (r) await desconectar();
  }

  async function aoBaixarTudo() {
    setOcupado(true);
    await baixarTudo();
    setOcupado(false);
    avisar({ texto: 'Dados da planilha conferidos' });
  }

  const conectado = sync.status !== 'desconectado';

  return (
    <section class="cartao">
      <h2>Sincronização com o Google</h2>
      {!conectado ? (
        <form class="formulario" onSubmit={aoConectar}>
          <p class="dica">
            Conecte o app à sua conta Google para guardar tudo numa planilha, sincronizar entre o tablet e o celular e
            enviar compromissos ao Google Agenda e tarefas ao Google Tasks.
          </p>
          <textarea
            class="campo codigo"
            rows={3}
            placeholder="Cole aqui o código de conexão (começa com AGENDA1:)"
            value={codigo}
            onInput={(e) => setCodigo(e.currentTarget.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
          />
          {erro && <p class="erros" role="alert">{erro}</p>}
          <div class="linha">
            <button type="submit" class="botao primario" disabled={ocupado || !codigo.trim()}>
              {ocupado ? 'Conectando…' : 'Conectar'}
            </button>
          </div>
        </form>
      ) : (
        <div class="sync-painel">
          <div class={`sync-status ${sync.status}`}>
            <span class={`status-ponto ${sync.status}`} />
            <strong>{ROTULO_STATUS[sync.status]}</strong>
            <span>
              {sync.pendentes > 0 ? `${sync.pendentes} alteraç${sync.pendentes > 1 ? 'ões' : 'ão'} a enviar · ` : ''}
              última sincronização: {descreverUltimaSync(sync.ultimaSync)}
            </span>
          </div>
          {sync.erro && <p class="erros" role="alert">{sync.erro}</p>}
          {sync.google && (
            <div class={`sync-status${sync.google.erros ? ' erro' : ''}`}>
              <span class={`status-ponto ${sync.google.erros ? 'erro' : sync.google.pendentes ? 'pendente' : 'sincronizado'}`} />
              <strong>Google Agenda e Tasks</strong>
              <span>
                {sync.google.erros
                  ? `${sync.google.erros} item(ns) com erro — o servidor tentará de novo a cada 5 minutos`
                  : sync.google.pendentes
                    ? `${sync.google.pendentes} item(ns) sendo enviados`
                    : 'em dia'}
              </span>
              {sync.google.erros > 0 && sync.google.ultimoErro && <small class="dica">Último erro: {sync.google.ultimoErro}</small>}
            </div>
          )}
          <div class="linha">
            <button class="botao primario" disabled={sync.status === 'sincronizando'} onClick={() => sincronizar()}>
              Sincronizar agora
            </button>
            {sync.planilha && (
              <a class="botao" href={sync.planilha} target="_blank" rel="noopener noreferrer">
                Abrir planilha
              </a>
            )}
            <button class="botao" disabled={ocupado} onClick={aoBaixarTudo}>
              Baixar tudo da planilha
            </button>
            <button class="botao perigo" onClick={aoDesconectar}>
              Desconectar
            </button>
          </div>
          <p class="dica">
            A sincronização acontece sozinha: ao abrir o app, alguns segundos após cada alteração, quando a internet
            volta e a cada 5 minutos.
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------------- Agendas do Google exibidas no app ---------------- */

const ACESSO: Record<string, string> = {
  owner: 'sua',
  writer: 'pode editar',
  reader: 'só leitura',
  freeBusyReader: 'só livre/ocupado',
};

function CartaoAgendasExternas() {
  const sync = useSync();
  const escolhidas = useAgendasExternas();
  const { avisar } = useEstado();
  const [disponiveis, setDisponiveis] = useState<AgendaGoogle[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const conectado = sync.status !== 'desconectado';

  async function abrirEscolha() {
    setOcupado(true);
    setErro('');
    try {
      const lista = await listarAgendasGoogle();
      setDisponiveis(lista);
      setMarcadas(new Set(escolhidas.map((a) => a.id)));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível listar as agendas.');
    } finally {
      setOcupado(false);
    }
  }

  async function salvarEscolha() {
    setOcupado(true);
    await definirAgendasExternas((disponiveis ?? []).filter((a) => marcadas.has(a.id)));
    setOcupado(false);
    setDisponiveis(null);
    avisar({ texto: 'Agendas atualizadas' });
  }

  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  return (
    <section class="cartao">
      <h2>Agendas do Google no app</h2>
      <p class="dica">
        Mostra no calendário do app, <strong>somente para consulta</strong>, os eventos criados fora dele — convites,
        reuniões, agendas compartilhadas. Aparecem com a cor da agenda e borda tracejada, e contam no aviso de choque de
        horário.
      </p>

      {!conectado && <p class="dica">Conecte o app ao Google (acima) para escolher as agendas.</p>}

      {conectado && !disponiveis && (
        <>
          {escolhidas.length === 0 ? (
            <p class="dica">Nenhuma agenda escolhida.</p>
          ) : (
            <ul class="agendas-lista">
              {escolhidas.map((a) => (
                <li key={a.id}>
                  <i class="bolinha" style={{ background: a.cor }} /> {a.nome}
                  {a.principal && <small> · principal</small>}
                </li>
              ))}
            </ul>
          )}
          {sync.falhasExternos.length > 0 && (
            <p class="erros">
              Não foi possível ler: {sync.falhasExternos.map((f) => escolhidas.find((a) => a.id === f.agenda_id)?.nome ?? f.agenda_id).join(', ')}
            </p>
          )}
          {erro && <p class="erros">{erro}</p>}
          <div class="linha">
            <button class="botao primario" disabled={ocupado} onClick={abrirEscolha}>
              {ocupado ? 'Buscando agendas…' : 'Escolher agendas'}
            </button>
          </div>
        </>
      )}

      {disponiveis && (
        <div class="formulario">
          {disponiveis.map((a) => (
            <label key={a.id} class="agenda-opcao">
              <input type="checkbox" checked={marcadas.has(a.id)} onChange={() => alternar(a.id)} />
              <i class="bolinha grande" style={{ background: a.cor }} />
              <span>
                <strong>{a.nome}</strong>
                <small>
                  {a.principal ? 'agenda principal · ' : ''}
                  {ACESSO[a.acesso] ?? a.acesso}
                </small>
              </span>
            </label>
          ))}
          <p class="dica">
            Na agenda principal, os eventos criados pelo próprio app não aparecem duplicados. As agendas "Aniversários" e
            "Férias" do app não entram na lista — já estão no app.
          </p>
          <div class="linha">
            <button class="botao primario" disabled={ocupado} onClick={salvarEscolha}>
              {ocupado ? 'Salvando…' : 'Salvar'}
            </button>
            <button class="botao" onClick={() => setDisponiveis(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Preferências ---------------- */

function CartaoPreferencias() {
  const config = useConfig();
  const mudar = (parcial: Partial<Config>) => salvarConfig(parcial);

  return (
    <section class="cartao">
      <h2>Preferências</h2>
      <div class="preferencias">
        <label>
          <span>A semana começa no</span>
          <div class="segmentado pequeno">
            <button role="radio" aria-checked={config.primeiro_dia_semana === 0} onClick={() => mudar({ primeiro_dia_semana: 0 })}>
              Domingo
            </button>
            <button role="radio" aria-checked={config.primeiro_dia_semana === 1} onClick={() => mudar({ primeiro_dia_semana: 1 })}>
              Segunda
            </button>
          </div>
        </label>
        <Numero rotulo="Tarefas concluídas ficam visíveis por" sufixo="dias" valor={config.dias_manter_concluidas} opcoes={[1, 3, 7, 14, 30]} aoMudar={(v) => mudar({ dias_manter_concluidas: v })} />
        <Numero rotulo="Avisar aniversários com antecedência de" sufixo="dias" valor={config.dias_aviso_aniversario} opcoes={[0, 1, 3, 7, 14]} aoMudar={(v) => mudar({ dias_aviso_aniversario: v })} />
        <Numero rotulo="Alertar quando houver mais de" sufixo="pessoas de férias" valor={config.limite_ausentes_equipe} opcoes={[1, 2, 3, 4, 5, 6, 8, 10]} aoMudar={(v) => mudar({ limite_ausentes_equipe: v })} />
      </div>
      <p class="dica">As preferências valem para este aparelho.</p>
    </section>
  );
}

function Numero(props: { rotulo: string; sufixo: string; valor: number; opcoes: number[]; aoMudar: (v: number) => void }) {
  return (
    <label>
      <span>{props.rotulo}</span>
      <span class="linha">
        <select class="campo" value={props.valor} onChange={(e) => props.aoMudar(Number(e.currentTarget.value))}>
          {props.opcoes.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {props.sufixo}
      </span>
    </label>
  );
}

/* ---------------- Este aparelho ---------------- */

function CartaoAparelho() {
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [uso, setUso] = useState<string>('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersistente).catch(() => setPersistente(null));
    navigator.storage
      ?.estimate?.()
      .then((e) => setUso(e.usage ? `${(e.usage / 1024 / 1024).toFixed(1)} MB` : ''))
      .catch(() => undefined);
  }, []);

  return (
    <section class="cartao">
      <h2>Este aparelho</h2>
      <ul class="info-lista">
        <li>
          <span>Proteção dos dados locais</span>
          <strong>
            {persistente === null ? '—' : persistente ? '✔ Ativa' : '⚠ Inativa (instale o app na tela inicial)'}
          </strong>
        </li>
        {uso && (
          <li>
            <span>Espaço usado</span>
            <strong>{uso}</strong>
          </li>
        )}
        <li>
          <span>Versão do app</span>
          <strong>{__VERSAO__}</strong>
        </li>
      </ul>
    </section>
  );
}
