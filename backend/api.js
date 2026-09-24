// API do app (Google Apps Script, publicada como "App da Web").
// Toda requisição precisa do token secreto gerado em configurar().

var PROP_PLANILHA = 'PLANILHA_ID';
var PROP_TOKEN = 'TOKEN';
var ABA_LOG = 'LOG_SYNC';
var MAX_LINHAS_LOG = 3000;
var PROP_ESTRUTURA = 'ESTRUTURA';
var VERSAO_ESTRUTURA = '2';
var PROP_GOOGLE = 'GOOGLE_AGENDA_ATIVO';
var PRAZO_GOOGLE_MS = 15000;

/** O envio ao Google Agenda só começa depois que configurar() foi executado com a permissão da Agenda. */
function googleAtivo() {
  return PropertiesService.getScriptProperties().getProperty(PROP_GOOGLE) === 'SIM';
}

/** Cria abas novas quando o backend é atualizado (sem precisar rodar configurar de novo). */
function garantirEstrutura(planilha) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_ESTRUTURA) === VERSAO_ESTRUTURA) return;
  prepararAba(planilha, ABA_GOOGLE, COLUNAS_GOOGLE);
  props.setProperty(PROP_ESTRUTURA, VERSAO_ESTRUTURA);
}

function doGet() {
  return ContentService.createTextOutput('Agenda API ativa (versão ' + VERSAO_API + ').');
}

function doPost(e) {
  var resposta;
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
    if (!token || req.token !== token) {
      resposta = { ok: false, erro: 'Token inválido', codigo: 401 };
    } else {
      var trava = LockService.getScriptLock();
      trava.waitLock(30000);
      try {
        var planilha = abrirPlanilha();
        garantirEstrutura(planilha);
        var tabelas = tabelasDaPlanilha(planilha);
        resposta = processar(tabelas, req, new Date().toISOString());
        if (resposta.log && resposta.log.length) registrarLog(planilha, resposta.log);
        delete resposta.log;
        if (req.acao === 'ping') resposta.planilha = planilha.getUrl();

        // Google Agenda: marca o que mudou e envia o que der em poucos segundos (o resto vai pelo gatilho)
        if (resposta.ok && googleAtivo()) {
          if (req.acao === 'sincronizar') {
            var aplicadas = (req.operacoes || []).filter(function (op, i) {
              var r = resposta.resultados[i];
              return r && r.ok && !r.ignorado;
            });
            marcarPendentesGoogle(planilha, tabelas, aplicadas);
          }
          resposta.google = processarGoogle(planilha, tabelas, req.acao === 'sincronizar' ? PRAZO_GOOGLE_MS : 0);
        }
      } finally {
        trava.releaseLock();
      }
    }
  } catch (erro) {
    resposta = { ok: false, erro: String(erro && erro.message ? erro.message : erro) };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta)).setMimeType(ContentService.MimeType.JSON);
}

function abrirPlanilha() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_PLANILHA);
  if (!id) throw new Error('Execute configurar() no editor do Apps Script primeiro.');
  return SpreadsheetApp.openById(id);
}

/** Adapta cada aba ao formato esperado pelo núcleo (lê uma vez, grava célula a célula). */
function tabelasDaPlanilha(planilha) {
  var tabelas = {};
  Object.keys(ESQUEMA).forEach(function (entidade) {
    var aba = planilha.getSheetByName(ESQUEMA[entidade].aba);
    var colunas = cabecalho(entidade).length;
    var cache = null;
    var ler = function () {
      if (cache === null) {
        var n = aba.getLastRow() - 1;
        cache = n > 0 ? aba.getRange(2, 1, n, colunas).getDisplayValues() : [];
      }
      return cache;
    };
    tabelas[entidade] = {
      linhas: ler,
      atualizar: function (i, valores) {
        ler()[i] = valores;
        aba.getRange(i + 2, 1, 1, colunas).setValues([valores]);
      },
      anexar: function (valores) {
        ler().push(valores);
        aba.getRange(cache.length + 1, 1, 1, colunas).setValues([valores]);
      },
    };
  });
  return tabelas;
}

function registrarLog(planilha, linhas) {
  var aba = planilha.getSheetByName(ABA_LOG);
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
  var excesso = aba.getLastRow() - 1 - MAX_LINHAS_LOG;
  if (excesso > 500) aba.deleteRows(2, excesso);
}
