// Formulário de pessoa: nome, aniversário (ano opcional), equipe, cargo, cor, ativo.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Pessoa } from '../../dominio/tipos';
import { diasNoMes, escreverNascimento, lerNascimento, novaPessoa, proximoAniversario, descreverAniversario, validarPessoa } from '../../dominio/pessoas';
import { diasCorridos, eventosEntre, tituloEvento } from '../../dominio/ferias';
import { hojeISO } from '../../dominio/datas';
import { buscar, listarTodos, novoId } from '../../dados/repositorio';
import { useEntidade } from '../../dados/ganchos';
import { CORES_PESSOA, salvarPessoa } from '../acoes/pessoas';
import { useEstado } from '../estado';
import { IconeFerias } from '../icones';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

export function FormPessoa({ id }: { id?: string }) {
  const { fecharPainel, avisar, abrirPainel } = useEstado();
  const eventos = useEntidade('eventos');
  const [p, setP] = useState<Pessoa | null>(null);
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const nome = useRef<HTMLInputElement>(null);
  const nova = !id;
  const hoje = hojeISO();

  useEffect(() => {
    (async () => {
      const existente = id ? await buscar('pessoas', id) : undefined;
      const base = existente ?? novaPessoa({ id: novoId(), cor: CORES_PESSOA[(await listarTodos('pessoas')).length % CORES_PESSOA.length] });
      setP(base);
      const n = base.data_nascimento ? lerNascimento(base.data_nascimento) : null;
      setDia(n ? String(n.dia) : '');
      setMes(n ? String(n.mes) : '');
      setAno(n?.ano ? String(n.ano) : '');
      setErros([]);
      if (!existente) setTimeout(() => nome.current?.focus(), 50);
    })();
  }, [id]);

  if (!p) return null;
  const mudar = (parcial: Partial<Pessoa>) => setP({ ...p, ...parcial });

  function montarNascimento(): string | null | 'invalida' {
    if (!dia && !mes && !ano) return null;
    if (!dia || !mes) return 'invalida';
    const texto = escreverNascimento({ ano: ano ? Number(ano) : null, mes: Number(mes), dia: Number(dia) });
    return lerNascimento(texto) ? texto : 'invalida';
  }

  async function salvar(e: Event) {
    e.preventDefault();
    const nasc = montarNascimento();
    const final = { ...p!, nome: p!.nome.trim(), apelido: p!.apelido.trim(), cargo: p!.cargo.trim(), data_nascimento: nasc === 'invalida' ? '0000-00-00' : nasc };
    const problemas = validarPessoa(final);
    if (nasc === 'invalida' && !problemas.length) problemas.push('Data de aniversário inválida.');
    if (ano && (Number(ano) < 1900 || Number(ano) > Number(hoje.slice(0, 4)))) problemas.push('Ano de nascimento inválido.');
    setErros(problemas);
    if (problemas.length) return;
    const desfazer = await salvarPessoa(final);
    fecharPainel();
    avisar({ texto: nova ? 'Pessoa cadastrada' : 'Pessoa salva', desfazer: nova ? desfazer : undefined });
  }

  async function alternarAtivo() {
    const desfazer = await salvarPessoa({ ...p!, ativo: !p!.ativo });
    fecharPainel();
    avisar({ texto: p!.ativo ? 'Pessoa desativada' : 'Pessoa reativada', desfazer });
  }

  const maxDia = mes ? diasNoMes(ano ? Number(ano) : 2000, Number(mes)) : 31;
  const proximo = !nova && p.data_nascimento ? proximoAniversario(p, hoje) : null;
  const periodos = nova ? [] : eventosEntre(eventos, '0000-01-01', '9999-12-31').filter((e) => e.pessoa_id === p.id);
  const pessoasMapa = new Map([[p.id, p]]);

  return (
    <form class="formulario" onSubmit={salvar}>
      <input ref={nome} class="campo campo-titulo" placeholder="Nome completo" value={p.nome} onInput={(e) => mudar({ nome: e.currentTarget.value })} />
      <div class="linha">
        <input class="campo" style={{ flex: 1 }} placeholder="Apelido (opcional)" value={p.apelido} onInput={(e) => mudar({ apelido: e.currentTarget.value })} />
        <input class="campo" style={{ flex: 1 }} placeholder="Cargo / relação" value={p.cargo} onInput={(e) => mudar({ cargo: e.currentTarget.value })} />
      </div>

      <fieldset>
        <legend>Aniversário</legend>
        <div class="linha">
          <select class="campo" value={dia} onChange={(e) => setDia(e.currentTarget.value)} aria-label="Dia">
            <option value="">Dia</option>
            {Array.from({ length: maxDia }, (_, i) => (
              <option key={i} value={String(i + 1)}>{i + 1}</option>
            ))}
          </select>
          <select class="campo" value={mes} onChange={(e) => setMes(e.currentTarget.value)} aria-label="Mês">
            <option value="">Mês</option>
            {MESES.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
          <input
            class="campo campo-curto"
            style={{ width: '96px' }}
            inputMode="numeric"
            placeholder="Ano"
            maxLength={4}
            value={ano}
            onInput={(e) => setAno(e.currentTarget.value.replace(/\D/g, ''))}
            aria-label="Ano (opcional)"
          />
        </div>
        <p class="dica">
          O ano é opcional — com ele, o app mostra a idade.
          {proximo && <> Próximo: <strong>{descreverAniversario(proximo, hoje)}</strong>.</>}
        </p>
      </fieldset>

      <label class="interruptor">
        <input type="checkbox" checked={p.da_equipe} onChange={(e) => mudar({ da_equipe: e.currentTarget.checked })} />
        <span>Faz parte da equipe <small>(aparece na linha do tempo de férias)</small></span>
      </label>

      <fieldset>
        <legend>Cor</legend>
        <div class="cores">
          {CORES_PESSOA.map((cor) => (
            <button key={cor} type="button" class="cor" style={{ background: cor }} aria-pressed={p.cor === cor} aria-label={`Cor ${cor}`} onClick={() => mudar({ cor })} />
          ))}
        </div>
      </fieldset>

      {!nova && (
        <fieldset>
          <legend>Férias e períodos</legend>
          {periodos.length === 0 && <p class="dica">Nenhum período cadastrado.</p>}
          {periodos.map((e) => (
            <button key={e.id} type="button" class="linha-periodo" onClick={() => abrirPainel({ tipo: 'evento', id: e.id })}>
              <IconeFerias />
              <span>{tituloEvento(e, pessoasMapa)}</span>
              <small>
                {fmtCurto(e.data_inicio)} – {fmtCurto(e.data_fim)} · {diasCorridos(e.data_inicio, e.data_fim)} dias
              </small>
            </button>
          ))}
          <button type="button" class="link esquerda" onClick={() => abrirPainel({ tipo: 'evento', tipo_evento: p.da_equipe ? 'ferias_equipe' : 'outro', pessoa_id: p.id })}>
            + Adicionar férias ou período
          </button>
        </fieldset>
      )}

      {erros.length > 0 && (
        <ul class="erros" role="alert">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div class="acoes-form">
        <button type="submit" class="botao primario">{nova ? 'Cadastrar' : 'Salvar'}</button>
        {!nova && (
          <button type="button" class={`botao${p.ativo ? ' perigo' : ''}`} onClick={alternarAtivo}>
            {p.ativo ? 'Desativar' : 'Reativar'}
          </button>
        )}
      </div>
      {!nova && p.ativo && <p class="dica">Desativar esconde a pessoa e seus aniversários, mas mantém o histórico de férias.</p>}
    </form>
  );
}
