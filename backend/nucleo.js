// Núcleo do backend (JavaScript puro, sem APIs do Google).
// Roda no Google Apps Script e também nos testes automáticos do app (Node).
//
// Cada entidade é uma aba da planilha: cabeçalho na linha 1, um registro por linha.
// A última coluna (_recebido_em) marca quando o servidor recebeu a versão — é o que
// permite a cada aparelho baixar "só o que mudou desde a última vez".

var VERSAO_API = 1;

// Tipos: s = texto, s? = texto ou vazio (null), n = número, b = sim/não, j = lista/objeto (JSON)
// Campos novos entram SEMPRE no fim da lista (antes de _recebido_em), com migração em garantirEstrutura().
var ESQUEMA = {
  tarefas: {
    aba: 'TAREFAS',
    campos: [
      ['id', 's'], ['titulo', 's'], ['descricao', 's'], ['lista_id', 's'], ['prioridade', 's'],
      ['prazo', 's?'], ['prazo_hora', 's?'], ['rrule', 's?'], ['status', 's'], ['concluida_em', 's?'],
      ['ordem', 'n'], ['tarefa_origem_id', 's?'], ['proxima_gerada_id', 's?'], ['sync_google', 'b'],
      ['google_task_id', 's?'], ['criado_em', 's'], ['atualizado_em', 's'],
    ],
  },
  listas: {
    aba: 'LISTAS',
    campos: [
      ['id', 's'], ['nome', 's'], ['cor', 's'], ['ordem', 'n'], ['ativo', 'b'],
      ['google_tasklist_id', 's?'], ['criado_em', 's'], ['atualizado_em', 's'],
    ],
  },
  compromissos: {
    aba: 'COMPROMISSOS',
    campos: [
      ['id', 's'], ['titulo', 's'], ['descricao', 's'], ['local', 's'], ['inicio', 's'], ['fim', 's'],
      ['dia_inteiro', 'b'], ['categoria_id', 's?'], ['rrule', 's?'], ['serie_id', 's?'],
      ['ocorrencia_original', 's?'], ['excecoes', 'j'], ['lembretes', 'j'], ['sync_google', 'b'],
      ['google_event_id', 's?'], ['status', 's'], ['criado_em', 's'], ['atualizado_em', 's'],
    ],
  },
  categorias: {
    aba: 'CATEGORIAS',
    campos: [
      ['id', 's'], ['nome', 's'], ['cor', 's'], ['icone', 's'], ['ordem', 'n'], ['ativo', 'b'],
      ['criado_em', 's'], ['atualizado_em', 's'], ['privada', 'b'],
    ],
  },
  pessoas: {
    aba: 'PESSOAS',
    campos: [
      ['id', 's'], ['nome', 's'], ['apelido', 's'], ['data_nascimento', 's?'], ['da_equipe', 'b'],
      ['cargo', 's'], ['cor', 's'], ['google_aniversario_id', 's?'], ['ativo', 'b'],
      ['criado_em', 's'], ['atualizado_em', 's'],
    ],
  },
  eventos: {
    aba: 'EVENTOS',
    campos: [
      ['id', 's'], ['tipo', 's'], ['titulo', 's'], ['pessoa_id', 's?'], ['data_inicio', 's'],
      ['data_fim', 's'], ['observacoes', 's'], ['sync_google', 'b'], ['google_event_id', 's?'],
      ['status', 's'], ['criado_em', 's'], ['atualizado_em', 's'],
    ],
  },
};

var COLUNA_RECEBIDO = '_recebido_em';

/** Posição (0 = primeira) de um campo na aba da entidade. */
function colunaDe(entidade, campo) {
  var campos = ESQUEMA[entidade].campos;
  for (var i = 0; i < campos.length; i++) if (campos[i][0] === campo) return i;
  return -1;
}

function cabecalho(entidade) {
  return ESQUEMA[entidade].campos.map(function (c) { return c[0]; }).concat([COLUNA_RECEBIDO]);
}

/** Registro do app → linha da planilha (tudo como texto, para a planilha não "converter" datas). */
function registroParaLinha(entidade, registro, recebidoEm) {
  var linha = ESQUEMA[entidade].campos.map(function (c) {
    var valor = registro[c[0]];
    if (valor === null || valor === undefined) return '';
    if (c[1] === 'j') return JSON.stringify(valor);
    if (c[1] === 'b') return valor ? 'SIM' : 'NÃO';
    return String(valor);
  });
  linha.push(recebidoEm);
  return linha;
}

/** Linha da planilha → registro do app. */
function linhaParaRegistro(entidade, linha) {
  var registro = {};
  ESQUEMA[entidade].campos.forEach(function (c, i) {
    var bruto = linha[i];
    var texto = bruto === null || bruto === undefined ? '' : String(bruto);
    switch (c[1]) {
      case 's?': registro[c[0]] = texto === '' ? null : texto; break;
      case 'n': registro[c[0]] = texto === '' ? 0 : Number(texto); break;
      case 'b': registro[c[0]] = texto === 'SIM' || texto === 'TRUE' || texto === 'true' || bruto === true; break;
      case 'j':
        try { registro[c[0]] = texto ? JSON.parse(texto) : []; } catch (e) { registro[c[0]] = []; }
        break;
      default: registro[c[0]] = texto;
    }
  });
  return registro;
}

/**
 * Aplica as operações enviadas por um aparelho.
 * tabelas[entidade] = { linhas(): valores[][] (sem cabeçalho), atualizar(i, valores), anexar(valores) }
 * Regra: uma versão mais antiga (atualizado_em menor) nunca sobrescreve uma mais nova.
 */
function aplicarOperacoes(tabelas, operacoes, agora) {
  var indices = {};
  var resultados = [];
  var log = [];

  operacoes.forEach(function (op) {
    var r = { id: op.id, ok: true };
    try {
      if (!ESQUEMA[op.entidade]) throw new Error('Entidade desconhecida: ' + op.entidade);
      var reg = op.payload;
      if (!reg || reg.id !== op.registro_id) throw new Error('Registro inválido');
      var tabela = tabelas[op.entidade];

      if (!indices[op.entidade]) {
        indices[op.entidade] = {};
        tabela.linhas().forEach(function (l, i) { indices[op.entidade][String(l[0])] = i; });
      }
      var idx = indices[op.entidade][reg.id];
      var colAtualizado = colunaDe(op.entidade, 'atualizado_em');

      if (idx !== undefined) {
        var existente = tabela.linhas()[idx];
        if (String(existente[colAtualizado]) > String(reg.atualizado_em)) {
          r.ignorado = true; // o servidor já tem uma versão mais nova
        } else {
          tabela.atualizar(idx, registroParaLinha(op.entidade, reg, agora));
        }
      } else {
        tabela.anexar(registroParaLinha(op.entidade, reg, agora));
        indices[op.entidade][reg.id] = tabela.linhas().length - 1;
      }
    } catch (e) {
      r.ok = false;
      r.erro = String(e && e.message ? e.message : e);
    }
    resultados.push(r);
    log.push([agora, op.entidade, op.registro_id, op.operacao, r.ok ? (r.ignorado ? 'ignorado' : 'ok') : 'erro', r.erro || '']);
  });

  return { resultados: resultados, log: log };
}

/** Registros recebidos pelo servidor depois do cursor (todos, se cursor vazio). */
function alteracoesDesde(tabelas, cursor) {
  var dados = {};
  Object.keys(ESQUEMA).forEach(function (entidade) {
    var col = ESQUEMA[entidade].campos.length; // coluna _recebido_em
    dados[entidade] = tabelas[entidade]
      .linhas()
      .filter(function (l) { return l[0] !== '' && (!cursor || String(l[col]) > cursor); })
      .map(function (l) { return linhaParaRegistro(entidade, l); });
  });
  return dados;
}

/** Processa uma requisição já autenticada. */
function processar(tabelas, req, agora) {
  if (req.acao === 'ping') return { ok: true, versao: VERSAO_API, agora: agora };
  if (req.acao === 'sincronizar') {
    var aplicado = aplicarOperacoes(tabelas, req.operacoes || [], agora);
    return {
      ok: true,
      versao: VERSAO_API,
      resultados: aplicado.resultados,
      log: aplicado.log,
      dados: alteracoesDesde(tabelas, req.cursor || null),
      cursor: agora,
    };
  }
  return { ok: false, erro: 'Ação desconhecida: ' + req.acao };
}

/** Tabela em memória (para testes e simulação). */
function tabelaEmMemoria() {
  var linhas = [];
  return {
    linhas: function () { return linhas; },
    atualizar: function (i, valores) { linhas[i] = valores; },
    anexar: function (valores) { linhas.push(valores); },
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    VERSAO_API: VERSAO_API,
    ESQUEMA: ESQUEMA,
    cabecalho: cabecalho,
    registroParaLinha: registroParaLinha,
    linhaParaRegistro: linhaParaRegistro,
    aplicarOperacoes: aplicarOperacoes,
    alteracoesDesde: alteracoesDesde,
    processar: processar,
    tabelaEmMemoria: tabelaEmMemoria,
  };
}
