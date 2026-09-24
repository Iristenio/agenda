// Eventos do Google Agenda criados FORA do app (convites, reuniões, agendas compartilhadas),
// exibidos no app somente para leitura. O aparelho escolhe quais agendas quer ver.

var JANELA_PASSADO_DIAS = 60;
var JANELA_FUTURO_DIAS = 400;
var MAX_EXTERNOS = 3000;

/** Agendas da conta (exceto as que o próprio app cria). */
function listarAgendas() {
  var props = PropertiesService.getScriptProperties();
  var doApp = {};
  ['aniversarios', 'ferias_pessoais', 'ferias_equipe'].forEach(function (k) {
    var id = props.getProperty('AGENDA_' + k.toUpperCase());
    if (id) doApp[id] = true;
  });
  var itens = [];
  var pagina = null;
  do {
    var r = Calendar.CalendarList.list({ maxResults: 250, pageToken: pagina || undefined });
    (r.items || []).forEach(function (c) {
      if (doApp[c.id]) return;
      itens.push({
        id: c.id,
        nome: c.summaryOverride || c.summary || c.id,
        cor: c.backgroundColor || '#697386',
        principal: !!c.primary,
        acesso: c.accessRole, // owner | writer | reader | freeBusyReader
      });
    });
    pagina = r.nextPageToken;
  } while (pagina);
  // Principal primeiro, depois por nome
  return itens.sort(function (a, b) { return (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || a.nome.localeCompare(b.nome); });
}

function dataHoraLocal(dt) {
  return Utilities.formatDate(new Date(dt), FUSO, "yyyy-MM-dd'T'HH:mm");
}

function diaAnterior(data) {
  var p = data.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] - 1)).toISOString().slice(0, 10);
}

/** Eventos das agendas escolhidas, já expandidos (uma entrada por ocorrência). */
function buscarExternos(agendaIds, controle) {
  // Eventos que o próprio app criou na agenda principal não entram (já existem no app)
  var doApp = controle.idsGoogleDaAgenda('principal');
  var agora = Date.now();
  var timeMin = new Date(agora - JANELA_PASSADO_DIAS * 86400000).toISOString();
  var timeMax = new Date(agora + JANELA_FUTURO_DIAS * 86400000).toISOString();
  var itens = [];
  var falhas = [];

  agendaIds.forEach(function (agendaId) {
    try {
      var pagina = null;
      do {
        var r = Calendar.Events.list(agendaId, {
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken: pagina || undefined,
        });
        (r.items || []).forEach(function (e) {
          if (e.status === 'cancelled' || !e.start) return;
          if (doApp[e.id] || (e.recurringEventId && doApp[e.recurringEventId])) return;
          var diaInteiro = !!e.start.date;
          itens.push({
            id: agendaId + '|' + e.id,
            agenda_id: agendaId,
            titulo: e.summary || '(ocupado)',
            local: e.location || '',
            inicio: diaInteiro ? e.start.date + 'T00:00' : dataHoraLocal(e.start.dateTime),
            fim: diaInteiro ? diaAnterior(e.end.date) + 'T23:59' : dataHoraLocal(e.end.dateTime),
            dia_inteiro: diaInteiro,
            link: e.htmlLink || '',
            livre: e.transparency === 'transparent',
          });
        });
        pagina = r.nextPageToken;
      } while (pagina && itens.length < MAX_EXTERNOS);
    } catch (e) {
      falhas.push({ agenda_id: agendaId, erro: textoErro(e).slice(0, 200) });
    }
  });
  return { itens: itens.slice(0, MAX_EXTERNOS), falhas: falhas, em: new Date().toISOString() };
}
