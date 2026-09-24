// Configuração inicial — execute a função configurar() uma vez no editor do Apps Script.
// Cria (ou reaproveita) a planilha, prepara as abas e mostra o código de conexão do app.

/** Endereço público da implantação "Agenda API v1" (atualizada com update-deployment, o endereço não muda). */
var URL_PUBLICA = 'https://script.google.com/macros/s/AKfycbyT4Muv6bJThcPvxAEYBvMBy3OFdXUlL2DvZGmdo04gl-NBJaQeLjS295c6VpAthzpw/exec';

function configurar() {
  var props = PropertiesService.getScriptProperties();

  // 1. Planilha
  var planilha;
  var id = props.getProperty(PROP_PLANILHA);
  if (id) {
    planilha = SpreadsheetApp.openById(id);
  } else {
    planilha = SpreadsheetApp.create('Agenda – dados');
    props.setProperty(PROP_PLANILHA, planilha.getId());
  }

  // 2. Abas das entidades
  Object.keys(ESQUEMA).forEach(function (entidade) {
    prepararAba(planilha, ESQUEMA[entidade].aba, cabecalho(entidade));
  });
  prepararAba(planilha, ABA_LOG, ['data_hora', 'entidade', 'registro_id', 'operacao', 'resultado', 'mensagem']);
  var padrao = planilha.getSheetByName('Página1') || planilha.getSheetByName('Sheet1');
  if (padrao && planilha.getSheets().length > 1) planilha.deleteSheet(padrao);

  // 3. Token secreto
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty(PROP_TOKEN, token);
  }

  // 4. Código de conexão (endereço PÚBLICO do App da Web + token).
  // Atenção: ScriptApp.getService().getUrl() executado no editor devolve o endereço de teste (/dev),
  // que exige login — por isso o endereço público da implantação fica fixo aqui.
  var url = URL_PUBLICA;
  Logger.log('Planilha: ' + planilha.getUrl());
  var codigo = 'AGENDA1:' + Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, t: token }));
  Logger.log('================ CÓDIGO DE CONEXÃO ================');
  Logger.log(codigo);
  Logger.log('Copie a linha acima e cole em Ajustes → Conectar ao Google, no app.');
}

/** Gera um novo token (use se desconfiar que o antigo vazou). Os aparelhos precisarão do novo código. */
function trocarToken() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_TOKEN);
  configurar();
}

function prepararAba(planilha, nome, colunas) {
  var aba = planilha.getSheetByName(nome) || planilha.insertSheet(nome);
  if (aba.getMaxColumns() < colunas.length) aba.insertColumnsAfter(aba.getMaxColumns(), colunas.length - aba.getMaxColumns());
  aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight('bold').setBackground('#e3ecfd');
  aba.setFrozenRows(1);
  // Tudo como texto: impede a planilha de transformar "2026-09-24" em data ou "10:00" em hora
  aba.getRange(1, 1, aba.getMaxRows(), colunas.length).setNumberFormat('@');
}
