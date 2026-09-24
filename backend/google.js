// Integração com o Google (Apps Script + serviços avançados "Calendar" e "Tasks").
//
// A aba GOOGLE_AGENDA guarda, para cada registro ("entidade:id"): o id no Google, onde está
// (agenda ou lista de tarefas), uma "assinatura" do último conteúdo enviado (evita chamadas
// repetidas), o status e — no Tasks — a data "updated" do Google já conhecida (evita eco).
//
// Envio (app → Google): logo após cada sincronização (até 15 s) e por um gatilho a cada 5 min.
// Recebimento (Google Tasks → app): no máximo 1 vez por minuto, na sincronização e no gatilho.

var ABA_GOOGLE = 'GOOGLE_AGENDA';
var COLUNAS_GOOGLE = ['chave', 'google_id', 'agenda', 'assinatura', 'status', 'erro', 'atualizado_em', 'google_atualizado'];
var CORES_AGENDAS = { aniversarios: '#E54666', ferias_pessoais: '#30A46C', ferias_equipe: '#F5A524' };
var ENTIDADES_AGENDA = ['compromissos', 'eventos', 'pessoas'];
var ENTIDADES_TASKS = ['listas', 'tarefas'];
var ENTIDADES_GOOGLE = ENTIDADES_AGENDA.concat(ENTIDADES_TASKS);
var PROP_TASKS = 'GOOGLE_TASKS_ATIVO';
var PROP_TASKS_CURSOR = 'TASKS_CURSOR';
var PROP_TASKS_ULTIMA = 'TASKS_ULTIMA_PUXADA';
var INTERVALO_PUXADA_MS = 60 * 1000;
var CORES_LISTAS_IMPORTADAS = ['#2f6fed', '#e5484d', '#f5a524', '#30a46c', '#8e4ec6', '#12a594'];

/**
 * O Tasks só funciona depois que (1) configurar() foi autorizado com o escopo do Tasks e
 * (2) a versão nova da API já rodou (garantirEstrutura) — assim uma versão antiga ainda
 * publicada nunca vê pendências de tarefas que não saberia tratar.
 */
function tasksAtivo() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty(PROP_TASKS) === 'SIM' && props.getProperty(PROP_ESTRUTURA) === VERSAO_ESTRUTURA;
}

function textoErro(e) { return String(e && e.message ? e.message : e); }

function naoExiste(erro) {
  return /Not Found|Resource has been deleted|404|410|notFound/i.test(textoErro(erro));
}

function assinar(objeto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(objeto)));
}

/* ---------------- Tabela de controle ---------------- */

function tabelaGoogle(planilha) {
  var aba = planilha.getSheetByName(ABA_GOOGLE);
  var n = aba.getLastRow() - 1;
  var linhas = n > 0 ? aba.getRange(2, 1, n, COLUNAS_GOOGLE.length).getDisplayValues() : [];
  var indice = {};
  var porGoogle = {};
  linhas.forEach(function (l, i) {
    indice[l[0]] = i;
    if (l[1]) porGoogle[l[1]] = l[0];
  });

  function paraObjeto(l) {
    var o = {};
    COLUNAS_GOOGLE.forEach(function (c, i) { o[c] = l[i]; });
    return o;
  }
  var tabela = {
    ler: function (chave) { return indice[chave] === undefined ? null : paraObjeto(linhas[indice[chave]]); },
    chavePorGoogleId: function (googleId) { return porGoogle[googleId] || null; },
    idsGoogleDaAgenda: function (agenda) {
      var ids = {};
      linhas.forEach(function (l) { if (l[1] && l[2] === agenda) ids[l[1]] = true; });
      return ids;
    },
    gravar: function (chave, campos) {
      var atual = tabela.ler(chave) || { chave: chave };
      if (atual.google_id && porGoogle[atual.google_id] === chave) delete porGoogle[atual.google_id];
      Object.keys(campos).forEach(function (k) { atual[k] = campos[k]; });
      atual.atualizado_em = new Date().toISOString();
      if (atual.google_id) porGoogle[atual.google_id] = chave;
      var valores = COLUNAS_GOOGLE.map(function (c) { return atual[c] === undefined || atual[c] === null ? '' : String(atual[c]); });
      if (indice[chave] === undefined) {
        linhas.push(valores);
        indice[chave] = linhas.length - 1;
      } else {
        linhas[indice[chave]] = valores;
      }
      aba.getRange(indice[chave] + 2, 1, 1, COLUNAS_GOOGLE.length).setValues([valores]);
    },
    pendentes: function () {
      // Listas antes das tarefas (a tarefa precisa da lista já criada no Google)
      return linhas
        .filter(function (l) { return l[4] === 'pendente' || l[4] === 'erro'; })
        .map(function (l) { return l[0]; })
        .sort(function (a, b) { return (a.indexOf('listas:') === 0 ? 0 : 1) - (b.indexOf('listas:') === 0 ? 0 : 1); });
    },
    resumo: function () {
      var r = { pendentes: 0, erros: 0, ultimoErro: '' };
      linhas.forEach(function (l) {
        if (l[4] === 'pendente') r.pendentes++;
        if (l[4] === 'erro') { r.erros++; r.ultimoErro = l[5]; }
      });
      return r;
    },
  };
  return tabela;
}

/* ---------------- Registros por id (a partir das abas) ---------------- */

function registrosPorId(tabelas) {
  var mapa = {};
  ENTIDADES_GOOGLE.forEach(function (entidade) {
    mapa[entidade] = {};
    tabelas[entidade].linhas().forEach(function (l) {
      if (l[0] !== '') mapa[entidade][String(l[0])] = linhaParaRegistro(entidade, l);
    });
  });
  return mapa;
}

function contexto(mapa) {
  var excecoes = {};
  Object.keys(mapa.compromissos).forEach(function (id) {
    var c = mapa.compromissos[id];
    if (c.serie_id) (excecoes[c.serie_id] = excecoes[c.serie_id] || []).push(c);
  });
  return {
    pessoas: mapa.pessoas,
    excecoesDe: function (id) { return excecoes[id] || []; },
  };
}

/* ---------------- Marcar pendências ---------------- */

/** Marca como pendentes os registros alterados (e os que dependem deles). */
function marcarPendentesGoogle(planilha, tabelas, operacoes, controle) {
  var ativas = ENTIDADES_AGENDA.concat(tasksAtivo() ? ENTIDADES_TASKS : []);
  var relevantes = operacoes.filter(function (op) { return ativas.indexOf(op.entidade) >= 0; });
  if (!relevantes.length) return;
  var mapa = registrosPorId(tabelas);
  var todos = { eventos: Object.keys(mapa.eventos).map(function (id) { return mapa.eventos[id]; }) };
  var vistos = {};
  relevantes.forEach(function (op) {
    dependentesGoogle(op.entidade, op.payload, todos).forEach(function (chave) {
      if (vistos[chave]) return;
      vistos[chave] = true;
      controle.gravar(chave, { status: 'pendente', erro: '' });
    });
  });
}

/** Marca todos os registros das entidades como pendentes (primeiro envio). */
function marcarTudoPendenteGoogle(planilha, tabelas, entidades) {
  var controle = tabelaGoogle(planilha);
  var mapa = registrosPorId(tabelas);
  (entidades || ENTIDADES_AGENDA).forEach(function (entidade) {
    Object.keys(mapa[entidade]).forEach(function (id) {
      controle.gravar(entidade + ':' + id, { status: 'pendente', erro: '' });
    });
  });
}

/* ---------------- Agendas ---------------- */

function idDaAgenda(chave) {
  if (chave === 'principal') return 'primary';
  var props = PropertiesService.getScriptProperties();
  var prop = 'AGENDA_' + chave.toUpperCase();
  var id = props.getProperty(prop);
  if (id && CalendarApp.getCalendarById(id)) return id;
  // Reaproveita uma agenda com o mesmo nome, ou cria
  var nome = AGENDAS[chave].nome;
  var existentes = CalendarApp.getOwnedCalendarsByName(nome);
  var agenda = existentes.length ? existentes[0] : CalendarApp.createCalendar(nome, { timeZone: FUSO });
  try { agenda.setColor(CORES_AGENDAS[chave]); } catch (e) { /* cor é opcional */ }
  props.setProperty(prop, agenda.getId());
  return agenda.getId();
}

function prepararAgendas() {
  ['aniversarios', 'ferias_pessoais', 'ferias_equipe'].forEach(idDaAgenda);
}

function enviarEvento(chave, entidade, reg, atual, controle, ctx) {
  var alvo = montarEventoGoogle(entidade, reg, ctx);
  if (!alvo) {
    if (atual.google_id) {
      try { Calendar.Events.remove(idDaAgenda(atual.agenda || 'principal'), atual.google_id); } catch (e) { if (!naoExiste(e)) throw e; }
    }
    controle.gravar(chave, { google_id: '', agenda: '', assinatura: '', status: 'ok', erro: '' });
    return;
  }
  var assinatura = assinar(alvo);
  var googleId = atual.google_id;
  if (googleId && atual.agenda === alvo.agenda && atual.assinatura === assinatura) {
    controle.gravar(chave, { status: 'ok', erro: '' });
    return;
  }
  if (googleId && atual.agenda && atual.agenda !== alvo.agenda) {
    try { Calendar.Events.remove(idDaAgenda(atual.agenda), googleId); } catch (e) { if (!naoExiste(e)) throw e; }
    googleId = '';
  }
  var agendaId = idDaAgenda(alvo.agenda);
  var salvo = null;
  if (googleId) {
    try { salvo = Calendar.Events.update(alvo.evento, agendaId, googleId); } catch (e) { if (!naoExiste(e)) throw e; }
  }
  if (!salvo) salvo = Calendar.Events.insert(alvo.evento, agendaId);
  controle.gravar(chave, { google_id: salvo.id, agenda: alvo.agenda, assinatura: assinatura, status: 'ok', erro: '' });
}

/* ---------------- Google Tasks: envio ---------------- */

function idListaPadrao() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('TASKS_LISTA_PADRAO');
  if (!id) {
    id = Tasks.Tasklists.get('@default').id;
    props.setProperty('TASKS_LISTA_PADRAO', id);
  }
  return id;
}

function enviarLista(chave, reg, atual, controle) {
  var id = chave.split(':')[1];
  if (id === 'geral') {
    controle.gravar(chave, { google_id: idListaPadrao(), agenda: 'tasks', status: 'ok', erro: '' });
    return;
  }
  var alvo = montarListaGoogle(reg);
  if (!alvo) {
    if (atual.google_id) {
      try { Tasks.Tasklists.remove(atual.google_id); } catch (e) { if (!naoExiste(e)) throw e; }
    }
    controle.gravar(chave, { google_id: '', agenda: '', assinatura: '', status: 'ok', erro: '' });
    return;
  }
  var assinatura = assinar(alvo);
  if (atual.google_id && atual.assinatura === assinatura) {
    controle.gravar(chave, { status: 'ok', erro: '' });
    return;
  }
  var salvo = null;
  if (atual.google_id) {
    try { salvo = Tasks.Tasklists.update({ id: atual.google_id, title: alvo.title }, atual.google_id); } catch (e) { if (!naoExiste(e)) throw e; }
  }
  if (!salvo) salvo = Tasks.Tasklists.insert(alvo);
  controle.gravar(chave, { google_id: salvo.id, agenda: 'tasks', assinatura: assinatura, status: 'ok', erro: '' });
}

/** Id da lista no Google para uma lista do app (cria na hora, se preciso). */
function idListaGoogle(listaId, mapa, controle) {
  if (listaId === 'geral') return idListaPadrao();
  var chave = 'listas:' + listaId;
  var linha = controle.ler(chave);
  if (linha && linha.google_id && linha.status === 'ok') return linha.google_id;
  var reg = mapa.listas[listaId];
  if (!reg || !reg.ativo) return idListaPadrao();
  enviarLista(chave, reg, linha || {}, controle);
  return controle.ler(chave).google_id || idListaPadrao();
}

function assinaturaTarefa(alvo, listaGoogle) {
  return assinar({ t: alvo.tarefa, l: listaGoogle });
}

function enviarTarefa(chave, reg, atual, controle, mapa) {
  var alvo = montarTarefaGoogle(reg);
  if (!alvo) {
    if (atual.google_id && atual.agenda) {
      try { Tasks.Tasks.remove(atual.agenda, atual.google_id); } catch (e) { if (!naoExiste(e)) throw e; }
    }
    controle.gravar(chave, { google_id: '', agenda: '', assinatura: '', status: 'ok', erro: '' });
    return;
  }
  var listaGoogle = idListaGoogle(alvo.lista, mapa, controle);
  var assinatura = assinaturaTarefa(alvo, listaGoogle);
  var googleId = atual.google_id;
  if (googleId && atual.agenda === listaGoogle && atual.assinatura === assinatura) {
    controle.gravar(chave, { status: 'ok', erro: '' });
    return;
  }
  if (googleId && atual.agenda && atual.agenda !== listaGoogle) {
    // Mudou de lista: o Google Tasks não move entre listas pela API → exclui e cria na nova
    try { Tasks.Tasks.remove(atual.agenda, googleId); } catch (e) { if (!naoExiste(e)) throw e; }
    googleId = '';
  }
  var salvo = null;
  if (googleId) {
    var recurso = JSON.parse(JSON.stringify(alvo.tarefa));
    recurso.id = googleId;
    if (recurso.status !== 'completed') recurso.completed = null;
    try { salvo = Tasks.Tasks.update(recurso, listaGoogle, googleId); } catch (e) { if (!naoExiste(e)) throw e; }
  }
  if (!salvo) salvo = Tasks.Tasks.insert(alvo.tarefa, listaGoogle);
  controle.gravar(chave, {
    google_id: salvo.id,
    agenda: listaGoogle,
    assinatura: assinatura,
    status: 'ok',
    erro: '',
    google_atualizado: salvo.updated || '',
  });
}

/* ---------------- Envio (agenda + tasks) ---------------- */

/** Processa pendências até acabar o tempo. Devolve o resumo (pendentes/erros). */
function processarGoogle(planilha, tabelas, prazoMs, controle) {
  var inicio = Date.now();
  controle = controle || tabelaGoogle(planilha);
  var chaves = controle.pendentes();
  if (!chaves.length) return controle.resumo();

  var mapa = registrosPorId(tabelas);
  var ctx = contexto(mapa);
  var comTasks = tasksAtivo();

  for (var i = 0; i < chaves.length; i++) {
    if (Date.now() - inicio >= prazoMs) break;
    var chave = chaves[i];
    var partes = chave.split(':');
    var entidade = partes[0];
    var reg = mapa[entidade] ? mapa[entidade][partes[1]] : null;
    var atual = controle.ler(chave) || {};
    try {
      if (entidade === 'listas') {
        if (comTasks) enviarLista(chave, reg, atual, controle);
      } else if (entidade === 'tarefas') {
        if (comTasks) enviarTarefa(chave, reg, atual, controle, mapa);
      } else {
        enviarEvento(chave, entidade, reg, atual, controle, ctx);
      }
    } catch (e) {
      controle.gravar(chave, { status: 'erro', erro: textoErro(e).slice(0, 300) });
    }
  }
  return controle.resumo();
}

/* ---------------- Google Tasks: recebimento (RT01–RT09) ---------------- */

/**
 * Traz do Google Tasks o que mudou desde a última vez e grava na planilha
 * (de onde os aparelhos recebem na sincronização). Devolve quantas tarefas/listas mudaram.
 */
function puxarTarefasGoogle(planilha, tabelas, controle, forcar) {
  if (!tasksAtivo()) return 0;
  var props = PropertiesService.getScriptProperties();
  var ultima = Number(props.getProperty(PROP_TASKS_ULTIMA) || 0);
  if (!forcar && Date.now() - ultima < INTERVALO_PUXADA_MS) return 0;
  props.setProperty(PROP_TASKS_ULTIMA, String(Date.now()));

  var agora = new Date().toISOString();
  var cursor = props.getProperty(PROP_TASKS_CURSOR);
  var mapa = registrosPorId(tabelas);
  var operacoes = [];
  var mudancas = 0;

  // 1) Listas do Google: importa as novas (RT09); a padrão é a "Geral" do app
  var padrao = idListaPadrao();
  var listasGoogle = (Tasks.Tasklists.list({ maxResults: 100 }).items || []);
  var appPorLista = {};
  var existentes = {};
  listasGoogle.forEach(function (tl, i) {
    existentes[tl.id] = true;
    if (tl.id === padrao) { appPorLista[tl.id] = 'geral'; return; }
    var chave = controle.chavePorGoogleId(tl.id);
    if (chave) { appPorLista[tl.id] = chave.split(':')[1]; return; }
    var nova = {
      id: 'g-' + tl.id, nome: tl.title || 'Lista', cor: CORES_LISTAS_IMPORTADAS[i % CORES_LISTAS_IMPORTADAS.length],
      ordem: 1000 + i, ativo: true, google_tasklist_id: null, criado_em: agora, atualizado_em: agora,
    };
    operacoes.push({ id: 'gl-' + tl.id, entidade: 'listas', registro_id: nova.id, operacao: 'criar', payload: nova });
    controle.gravar('listas:' + nova.id, { google_id: tl.id, agenda: 'tasks', assinatura: assinar(montarListaGoogle(nova)), status: 'ok', erro: '' });
    appPorLista[tl.id] = nova.id;
    mudancas++;
  });

  // Lista do app apagada direto no Google: recria no próximo envio (o app é a referência)
  Object.keys(mapa.listas).forEach(function (id) {
    var linha = controle.ler('listas:' + id);
    if (id !== 'geral' && linha && linha.google_id && !existentes[linha.google_id] && mapa.listas[id].ativo) {
      controle.gravar('listas:' + id, { google_id: '', assinatura: '', status: 'pendente' });
      Object.keys(mapa.tarefas).forEach(function (tid) {
        if (mapa.tarefas[tid].lista_id === id) controle.gravar('tarefas:' + tid, { google_id: '', agenda: '', assinatura: '', status: 'pendente' });
      });
    }
  });

  // 2) Tarefas alteradas desde o cursor (margem de 1 min para diferenças de relógio)
  var desde = cursor ? new Date(Date.parse(cursor) - 60000).toISOString() : null;
  Object.keys(appPorLista).forEach(function (tlId) {
    var listaApp = appPorLista[tlId];
    var pagina = null;
    do {
      var opcoes = { maxResults: 100, showCompleted: true, showHidden: true, showDeleted: !!desde };
      if (desde) opcoes.updatedMin = desde;
      if (pagina) opcoes.pageToken = pagina;
      var resposta = Tasks.Tasks.list(tlId, opcoes);
      (resposta.items || []).forEach(function (gt) {
        var chave = controle.chavePorGoogleId(gt.id);
        if (chave) {
          var linha = controle.ler(chave);
          if (linha.google_atualizado && gt.updated <= linha.google_atualizado) return; // eco do próprio envio / já visto
          var id = chave.split(':')[1];
          var atual = mapa.tarefas[id];
          if (!atual) return;
          var pendente = linha.status === 'pendente' || linha.status === 'erro';
          var decisao = resolverConflito(gt, atual, pendente);
          if (decisao === 'ignorar') {
            controle.gravar(chave, { google_atualizado: gt.updated });
            return;
          }
          var novo;
          if (decisao === 'so_conclusao') {
            novo = JSON.parse(JSON.stringify(atual));
            novo.status = 'concluida';
            novo.concluida_em = gt.completed || agora;
          } else {
            novo = aplicarTarefaDoGoogle(gt, atual, listaApp, agora);
            if (linha.agenda && linha.agenda !== tlId) novo.lista_id = listaApp;
          }
          novo.atualizado_em = agora;
          operacoes.push({ id: 'gt-' + gt.id, entidade: 'tarefas', registro_id: novo.id, operacao: 'alterar', payload: novo });
          var alvo = montarTarefaGoogle(novo);
          controle.gravar(chave, {
            google_atualizado: gt.updated,
            agenda: tlId,
            assinatura: alvo ? assinaturaTarefa(alvo, tlId) : '',
            status: pendente && decisao !== 'aplicar' ? linha.status : 'ok',
          });
          mudancas++;
        } else {
          if (gt.deleted) return;
          var criada = aplicarTarefaDoGoogle(gt, null, listaApp, agora);
          operacoes.push({ id: 'gt-' + gt.id, entidade: 'tarefas', registro_id: criada.id, operacao: 'criar', payload: criada });
          var alvoNovo = montarTarefaGoogle(criada);
          controle.gravar('tarefas:' + criada.id, {
            google_id: gt.id, agenda: tlId, assinatura: alvoNovo ? assinaturaTarefa(alvoNovo, tlId) : '',
            status: 'ok', erro: '', google_atualizado: gt.updated,
          });
          mudancas++;
        }
      });
      pagina = resposta.nextPageToken;
    } while (pagina);
  });

  if (operacoes.length) {
    var aplicado = aplicarOperacoes(tabelas, operacoes, agora);
    registrarLog(planilha, aplicado.log.map(function (l) { l[3] = 'google_tasks'; return l; }));
  }
  props.setProperty(PROP_TASKS_CURSOR, agora);
  return mudancas;
}

/* ---------------- Gatilho ---------------- */

/** Gatilho a cada 5 minutos: termina envios pendentes e traz novidades do Google Tasks. */
function processarPendentesGoogle() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(5000)) return;
  try {
    var planilha = abrirPlanilha();
    var tabelas = tabelasDaPlanilha(planilha);
    var controle = tabelaGoogle(planilha);
    processarGoogle(planilha, tabelas, 3 * 60 * 1000, controle);
    puxarTarefasGoogle(planilha, tabelas, controle, true);
  } finally {
    trava.releaseLock();
  }
}

function instalarGatilho() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processarPendentesGoogle'; });
  if (!existe) ScriptApp.newTrigger('processarPendentesGoogle').timeBased().everyMinutes(5).create();
}
