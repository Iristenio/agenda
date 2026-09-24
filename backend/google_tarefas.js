// Tradução entre tarefas do app e o Google Tasks, nas duas direções (JavaScript puro, testável).
//
// Limitações do Google Tasks (ver ESPECIFICACAO §2.2):
//  • o prazo só guarda a DATA (sem hora);
//  • não há prioridade → vai como prefixo nas notas: "[ALTA] ..." / "[BAIXA] ...";
//  • não há recorrência → cada ocorrência é uma tarefa; o app gera a próxima ao concluir.

var PREFIXOS = { alta: '[ALTA] ', baixa: '[BAIXA] ' };

/** App → Google. Devolve null se a tarefa NÃO deve existir no Google. */
function montarTarefaGoogle(reg) {
  if (!reg || reg.status === 'excluida' || !reg.sync_google) return null;
  var notas = (PREFIXOS[reg.prioridade] || '') + (reg.descricao || '');
  var tarefa = {
    title: reg.titulo || '(sem título)',
    notes: notas,
    status: reg.status === 'concluida' ? 'completed' : 'needsAction',
  };
  if (reg.prazo) tarefa.due = reg.prazo + 'T00:00:00.000Z';
  if (reg.status === 'concluida') tarefa.completed = reg.concluida_em || new Date().toISOString();
  return { lista: reg.lista_id, tarefa: tarefa };
}

/** Lista do app → lista do Google (null = não deve existir). A lista "Geral" é a lista padrão do Google. */
function montarListaGoogle(reg) {
  if (!reg || !reg.ativo) return null;
  return { title: reg.nome };
}

/** Separa a prioridade (prefixo) do texto das notas. */
function lerNotas(notas) {
  var texto = String(notas || '');
  var m = /^\[(ALTA|BAIXA)\]\s?/i.exec(texto);
  if (!m) return { prioridade: null, descricao: texto };
  return { prioridade: m[1].toUpperCase() === 'ALTA' ? 'alta' : 'baixa', descricao: texto.slice(m[0].length) };
}

/**
 * Google → App (RT02–RT08). `atual` é a versão do app (ou null para tarefa nova, RT03).
 * Devolve o registro atualizado (sem carimbos de data, que o servidor define).
 */
function aplicarTarefaDoGoogle(gt, atual, listaId, agoraIso) {
  var base = atual || {
    id: 'g-' + gt.id,
    titulo: '',
    descricao: '',
    lista_id: listaId,
    prioridade: 'media',
    prazo: null,
    prazo_hora: null,
    rrule: null,
    status: 'pendente',
    concluida_em: null,
    ordem: Date.parse(gt.updated || agoraIso) || 0,
    tarefa_origem_id: null,
    proxima_gerada_id: null,
    sync_google: true,
    google_task_id: null,
    criado_em: agoraIso,
    atualizado_em: agoraIso,
  };
  var r = {};
  Object.keys(base).forEach(function (k) { r[k] = base[k]; });

  if (gt.deleted) {
    r.status = 'excluida'; // RT08 — exclusão lógica, recuperável
    return r;
  }

  r.titulo = gt.title || r.titulo;
  var notas = lerNotas(gt.notes);
  r.descricao = notas.descricao;
  // RT05 — o app sempre grava o prefixo de alta/baixa; sem prefixo = média (inclusive se foi apagado no Google)
  r.prioridade = notas.prioridade || 'media';

  // RT04 — se a data não mudou, mantém a hora que o app tinha
  var novaData = gt.due ? String(gt.due).slice(0, 10) : null;
  if (novaData !== r.prazo) r.prazo_hora = null;
  r.prazo = novaData;

  if (gt.status === 'completed') {
    if (r.status !== 'concluida') r.concluida_em = gt.completed || agoraIso;
    r.status = 'concluida';
  } else if (r.status === 'concluida') {
    r.status = 'pendente'; // reaberta no Google
    r.concluida_em = null;
  }
  if (listaId && !atual) r.lista_id = listaId;
  return r;
}

/**
 * RT07 — conflito: se o app tem alteração ainda não enviada ao Google, ela vence —
 * exceto a conclusão feita no Google, que sempre vale (nunca "desconclui" por acidente).
 */
function resolverConflito(gt, atual, appPendente) {
  if (!appPendente || !atual) return 'aplicar';
  if (gt.status === 'completed' && atual.status !== 'concluida') return 'so_conclusao';
  return 'ignorar';
}

if (typeof module !== 'undefined') {
  module.exports = {
    montarTarefaGoogle: montarTarefaGoogle,
    montarListaGoogle: montarListaGoogle,
    lerNotas: lerNotas,
    aplicarTarefaDoGoogle: aplicarTarefaDoGoogle,
    resolverConflito: resolverConflito,
  };
}
