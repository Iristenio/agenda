// Painel de feriado:
//  • feriado cadastrado no app → formulário (nome, data, repete todo ano, excluir)
//  • feriado vindo do Google   → informações + "Não é folga" (RN43)
//  • sem id nem feriado na data → formulário de novo feriado
import { useEffect, useState } from 'preact/hooks';
import type { Feriado } from '../../dominio/tipos';
import { externoEhFeriado, nomesIgnorados, validarFeriado } from '../../dominio/feriados';
import { deDataISO } from '../../dominio/datas';
import { idsAgendasFeriado } from '../../dados/feriados';
import { useAgendasExternas, useEntidade, useExternos } from '../../dados/ganchos';
import { excluirFeriado, marcarNaoFolga, novoFeriado, salvarFeriado } from '../acoes/feriados';
import { useEstado } from '../estado';

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function PainelFeriado({ id, data }: { id?: string; data?: string }) {
  const { fecharPainel, avisar } = useEstado();
  const feriados = useEntidade('feriados');
  const externos = useExternos();
  const agendas = useAgendasExternas();
  const [f, setF] = useState<Feriado | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  // Feriado cadastrado: pelo id, ou o que cai nesta data (inclusive os anuais)
  const cadastrado = id
    ? feriados.find((x) => x.id === id)
    : data
      ? feriados.find((x) => x.status === 'ativo' && x.tipo === 'folga' && x.data && (x.anual ? x.data.slice(5) === data.slice(5) : x.data === data))
      : undefined;
  // Feriado do Google nesta data
  const doGoogle =
    !cadastrado && data
      ? externos.find((e) => externoEhFeriado(e, idsAgendasFeriado(agendas), nomesIgnorados(feriados)) && e.inicio.slice(0, 10) <= data && e.fim.slice(0, 10) >= data)
      : undefined;

  useEffect(() => {
    setErros([]);
    setF(cadastrado ? { ...cadastrado } : doGoogle ? null : novoFeriado({ data: data ?? null }));
  }, [id, data, cadastrado?.id, doGoogle?.id]);

  if (doGoogle && data) {
    const agenda = agendas.find((a) => a.id === doGoogle.agenda_id);
    return (
      <div class="formulario">
        <div class="externo-cabecalho" style={{ '--cor': '#c2410c' }}>
          <h3>🎉 {doGoogle.titulo}</h3>
          <span>{agenda?.nome ?? 'Google Agenda'}</span>
        </div>
        <ul class="info-lista">
          <li>
            <span>Quando</span>
            <strong>{fmtDia.format(deDataISO(data))}</strong>
          </li>
        </ul>
        <p class="dica">
          Conta como <strong>feriado</strong>: não é dia útil para as tarefas de "primeiro/último dia útil" nem para a
          contagem das férias.
        </p>
        <div class="acoes-form">
          <button
            type="button"
            class="botao"
            onClick={async () => {
              const desfazer = await marcarNaoFolga(doGoogle.titulo);
              fecharPainel();
              avisar({ texto: `"${doGoogle.titulo}" não conta mais como feriado`, desfazer });
            }}
          >
            Não é folga
          </button>
          {doGoogle.link && (
            <a class="botao" href={doGoogle.link} target="_blank" rel="noopener noreferrer">
              Abrir no Google
            </a>
          )}
        </div>
        <p class="dica">"Não é folga" vale para este nome em todos os anos (ex.: Dia das Mães, Carnaval).</p>
      </div>
    );
  }

  if (!f) return null;
  const novo = !cadastrado;

  async function salvar(e: Event) {
    e.preventDefault();
    const final = { ...f!, nome: f!.nome.trim() };
    const problemas = validarFeriado(final);
    setErros(problemas);
    if (problemas.length) return;
    const desfazer = await salvarFeriado(final);
    fecharPainel();
    avisar({ texto: novo ? 'Feriado cadastrado' : 'Feriado salvo', desfazer });
  }

  async function excluir() {
    const desfazer = await excluirFeriado(f!);
    fecharPainel();
    avisar({ texto: 'Feriado excluído', desfazer });
  }

  return (
    <form class="formulario" onSubmit={salvar}>
      <input
        class="campo campo-titulo"
        placeholder="Nome (ex.: Ponto facultativo, Recesso)"
        value={f.nome}
        autoFocus={novo}
        onInput={(e) => setF({ ...f, nome: e.currentTarget.value })}
      />
      <fieldset>
        <legend>Data</legend>
        <div class="linha">
          <input type="date" class="campo" value={f.data ?? ''} onInput={(e) => setF({ ...f, data: e.currentTarget.value || null })} />
        </div>
        <label class="interruptor">
          <input type="checkbox" checked={f.anual} onChange={(e) => setF({ ...f, anual: e.currentTarget.checked })} />
          <span>
            Repete todo ano <small>(mesmo dia e mês)</small>
          </span>
        </label>
      </fieldset>
      <p class="dica">
        Feriados cadastrados aqui se somam aos do Google. Para um recesso de vários dias, cadastre um feriado por dia.
      </p>
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
