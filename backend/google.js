// Envio ao Google Agenda (Apps Script + serviço avançado "Calendar").
//
// A aba GOOGLE_AGENDA guarda, para cada registro, o id do evento no Google, a agenda onde está,
// uma "assinatura" do último conteúdo enviado (evita chamadas repetidas) e o status.
// Pendências são processadas logo após cada sincronização e, o que sobrar, por um gatilho a cada 5 min.

var ABA_GOOGLE = 'GOOGLE_AGENDA';
var COLUNAS_GOOGLE = ['chave', 'google_id', 'agenda', 'assinatura', 'status', 'erro', 'atualizado_em'];
var CORES_AGENDAS = { aniversarios: '#E54666', ferias_pessoais: '#30A46C', ferias_equipe: '#F5A524' };
var ENTIDADES_GOOGLE = ['compromissos', 'eventos', 'pessoas'];

/* ---------------- Tabela de controle ---------------- */

function tabelaGoogle(planilha) {
  var aba = planilha.getSheetByName(ABA_GOOGLE);
  var n = aba.getLastRow() - 1;
  var linhas = n > 0 ? aba.getRange(2, 1, n, COLUNAS_GOOGLE.length).getDisplayValues() : [];
  var indice = {};
  linhas.forEach(function (l, i) { indice[l[0]] = i; });

  function paraObjeto(l) {
    var o = {};
    COLUNAS_GOOGLE.forEach(function (c, i) { o[c] = l[i]; });
    return o;
  }
  return {
    ler: function (chave) { return indice[chave] === undefined ? null : paraObjeto(linhas[indice[chave]]); },
    gravar: function (chave, campos) {
      var atual = this.ler(chave) || { chave: chave };
      Object.keys(campos).forEach(function (k) { atual[k] = campos[k]; });
      atual.atualizado_em = new Date().toISOString();
      var valores = COLUNAS_GOOGLE.map(function (c) { return atual[c] === undefined ? '' : String(atual[c]); });
      if (indice[chave] === undefined) {
        linhas.push(valores);
        indice[chave] = linhas.length - 1;
      } else {
        linhas[indice[chave]] = valores;
      }
      aba.getRange(indice[chave] + 2, 1, 1, COLUNAS_GOOGLE.length).setValues([valores]);
    },
    pendentes: function () {
      return linhas.filter(function (l) { return l[4] === 'pendente' || l[4] === 'erro'; }).map(function (l) { return l[0]; });
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
function marcarPendentesGoogle(planilha, tabelas, operacoes) {
  var relevantes = operacoes.filter(function (op) { return ENTIDADES_GOOGLE.indexOf(op.entidade) >= 0; });
  if (!relevantes.length) return;
  var mapa = registrosPorId(tabelas);
  var todos = { eventos: Object.keys(mapa.eventos).map(function (id) { return mapa.eventos[id]; }) };
  var controle = tabelaGoogle(planilha);
  var vistos = {};
  relevantes.forEach(function (op) {
    dependentesGoogle(op.entidade, op.payload, todos).forEach(function (chave) {
      if (vistos[chave]) return;
      vistos[chave] = true;
      controle.gravar(chave, { status: 'pendente', erro: '' });
    });
  });
}

/** Marca tudo como pendente (primeiro envio, ou para reenviar tudo). */
function marcarTudoPendenteGoogle(planilha, tabelas) {
  var controle = tabelaGoogle(planilha);
  var mapa = registrosPorId(tabelas);
  ENTIDADES_GOOGLE.forEach(function (entidade) {
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

/* ---------------- Envio ---------------- */

function naoExiste(erro) {
  var msg = String(erro && erro.message ? erro.message : erro);
  return /Not Found|Resource has been deleted|404|410/i.test(msg);
}

function excluirNoGoogle(agendaId, eventoId) {
  try {
    Calendar.Events.remove(agendaId, eventoId);
  } catch (e) {
    if (!naoExiste(e)) throw e;
  }
}

/** Processa pendências até acabar o tempo. Devolve o resumo (pendentes/erros). */
function processarGoogle(planilha, tabelas, prazoMs) {
  var inicio = Date.now();
  var controle = tabelaGoogle(planilha);
  var chaves = controle.pendentes();
  if (!chaves.length) return controle.resumo();

  var mapa = registrosPorId(tabelas);
  var ctx = contexto(mapa);

  for (var i = 0; i < chaves.length; i++) {
    if (Date.now() - inicio >= prazoMs) break;
    var chave = chaves[i];
    var partes = chave.split(':');
    var entidade = partes[0];
    var reg = mapa[entidade] ? mapa[entidade][partes[1]] : null;
    var atual = controle.ler(chave) || {};
    try {
      var alvo = montarEventoGoogle(entidade, reg, ctx);
      if (!alvo) {
        if (atual.google_id) excluirNoGoogle(idDaAgenda(atual.agenda || 'principal'), atual.google_id);
        controle.gravar(chave, { google_id: '', agenda: '', assinatura: '', status: 'ok', erro: '' });
        continue;
      }
      var assinatura = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(alvo)));
      var googleId = atual.google_id;
      if (googleId && atual.agenda === alvo.agenda && atual.assinatura === assinatura) {
        controle.gravar(chave, { status: 'ok', erro: '' });
        continue;
      }
      if (googleId && atual.agenda && atual.agenda !== alvo.agenda) {
        excluirNoGoogle(idDaAgenda(atual.agenda), googleId); // mudou de agenda (ex.: tipo de férias)
        googleId = '';
      }
      var agendaId = idDaAgenda(alvo.agenda);
      var salvo = null;
      if (googleId) {
        try {
          salvo = Calendar.Events.update(alvo.evento, agendaId, googleId);
        } catch (e) {
          if (!naoExiste(e)) throw e; // apagado direto no Google: cria de novo
        }
      }
      if (!salvo) salvo = Calendar.Events.insert(alvo.evento, agendaId);
      controle.gravar(chave, { google_id: salvo.id, agenda: alvo.agenda, assinatura: assinatura, status: 'ok', erro: '' });
    } catch (e) {
      controle.gravar(chave, { status: 'erro', erro: String(e && e.message ? e.message : e).slice(0, 300) });
    }
  }
  return controle.resumo();
}

/** Gatilho a cada 5 minutos: termina o que ficou pendente. */
function processarPendentesGoogle() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(5000)) return;
  try {
    var planilha = abrirPlanilha();
    processarGoogle(planilha, tabelasDaPlanilha(planilha), 4 * 60 * 1000);
  } finally {
    trava.releaseLock();
  }
}

function instalarGatilho() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processarPendentesGoogle'; });
  if (!existe) ScriptApp.newTrigger('processarPendentesGoogle').timeBased().everyMinutes(5).create();
}
