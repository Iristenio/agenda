// Tradução dos registros do app para eventos do Google Agenda (JavaScript puro, testável).
//
// Decisões:
//  • Compromissos → agenda principal. Séries viram um evento recorrente (RRULE + EXDATE).
//    Ocorrências alteradas separadamente ("só esta") viram eventos avulsos, e a data original
//    entra no EXDATE da série — visualmente idêntico no Google e muito mais robusto.
//  • Férias/períodos → agendas "Férias – Pessoais" ou "Férias – Equipe" (dia inteiro).
//  • Aniversários → agenda "Aniversários", evento anual; 29/02 vira "último dia de fevereiro".

var FUSO = 'America/Sao_Paulo';
var DESLOCAMENTO_UTC_HORAS = 3; // Brasília = UTC−3 (sem horário de verão desde 2019)

var AGENDAS = {
  principal: { nome: null },
  aniversarios: { nome: 'Aniversários' },
  ferias_pessoais: { nome: 'Férias – Pessoais' },
  ferias_equipe: { nome: 'Férias – Equipe' },
};

function dataCompacta(d) { return d.replace(/-/g, ''); } // 2026-09-24 → 20260924

function somarUmDia(data) {
  var p = data.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1));
  return d.toISOString().slice(0, 10);
}

function nomeDaPessoa(p) { return p ? (String(p.apelido || '').trim() || String(p.nome || '').trim()) : ''; }

/**
 * Converte a regra do app ("DTSTART:...\nRRULE:...") para o formato do Google.
 * O app grava UNTIL como 23:59:59 "flutuante"; o Google precisa de UTC real (ou só a data, no dia inteiro).
 */
function regraParaGoogle(rrule, diaInteiro) {
  var linha = String(rrule).split(/\r?\n/).filter(function (l) { return l.indexOf('RRULE:') === 0; })[0];
  if (!linha) return null;
  return linha.replace(/UNTIL=(\d{4})(\d{2})(\d{2})T\d{6}Z/, function (_, a, m, d) {
    if (diaInteiro) return 'UNTIL=' + a + m + d;
    var fim = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d), 23 + DESLOCAMENTO_UTC_HORAS, 59, 59));
    return 'UNTIL=' + fim.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  });
}

function inicioFim(c) {
  if (c.dia_inteiro) {
    return {
      start: { date: c.inicio.slice(0, 10) },
      end: { date: somarUmDia(c.fim.slice(0, 10)) }, // no Google o fim do dia inteiro é exclusivo
    };
  }
  return {
    start: { dateTime: c.inicio + ':00', timeZone: FUSO },
    end: { dateTime: c.fim + ':00', timeZone: FUSO },
  };
}

function lembretes(minutos) {
  var lista = (minutos || []).slice(0, 5).map(function (m) { return { method: 'popup', minutes: m }; });
  return { useDefault: false, overrides: lista };
}

/**
 * Monta o evento do Google para um registro, ou devolve null se ele NÃO deve existir no Google.
 * ctx.pessoas: { id → pessoa }; ctx.excecoesDe(serieId) → registros de exceção da série.
 */
function montarEventoGoogle(entidade, reg, ctx) {
  if (!reg) return null;

  if (entidade === 'compromissos') {
    if (reg.status !== 'ativo' || !reg.sync_google) return null;
    var evento = inicioFim(reg);
    evento.summary = reg.titulo || '(sem título)';
    if (reg.local) evento.location = reg.local;
    if (reg.descricao) evento.description = reg.descricao;
    evento.reminders = lembretes(reg.lembretes);

    if (reg.rrule) {
      var regra = regraParaGoogle(reg.rrule, reg.dia_inteiro);
      if (regra) {
        var datas = {};
        (reg.excecoes || []).forEach(function (d) { datas[d] = true; });
        (ctx.excecoesDe(reg.id) || []).forEach(function (e) {
          if (e.ocorrencia_original) datas[e.ocorrencia_original.slice(0, 10)] = true;
        });
        var lista = Object.keys(datas).sort();
        evento.recurrence = [regra];
        if (lista.length) {
          evento.recurrence.push(
            reg.dia_inteiro
              ? 'EXDATE;VALUE=DATE:' + lista.map(dataCompacta).join(',')
              : 'EXDATE;TZID=' + FUSO + ':' + lista.map(function (d) { return dataCompacta(d) + 'T' + reg.inicio.slice(11, 16).replace(':', '') + '00'; }).join(','),
          );
        }
      }
    }
    return { agenda: 'principal', evento: evento };
  }

  if (entidade === 'eventos') {
    if (reg.status !== 'ativo' || !reg.sync_google) return null;
    var pessoa = reg.pessoa_id ? ctx.pessoas[reg.pessoa_id] : null;
    var titulo = String(reg.titulo || '').trim();
    if (!titulo) {
      if (reg.tipo === 'ferias_pessoais') titulo = 'Minhas férias';
      else if (reg.tipo === 'ferias_equipe') titulo = pessoa ? 'Férias – ' + nomeDaPessoa(pessoa) : 'Férias';
      else titulo = pessoa ? 'Período – ' + nomeDaPessoa(pessoa) : 'Período';
    }
    var agenda = reg.tipo === 'ferias_equipe' || (reg.tipo === 'outro' && pessoa) ? 'ferias_equipe' : 'ferias_pessoais';
    var ev = {
      summary: (reg.tipo === 'outro' ? '📌 ' : '🌴 ') + titulo,
      start: { date: reg.data_inicio },
      end: { date: somarUmDia(reg.data_fim) },
      transparency: 'transparent', // não marca como "ocupado"
      reminders: { useDefault: false, overrides: [] },
    };
    if (reg.observacoes) ev.description = reg.observacoes;
    return { agenda: agenda, evento: ev };
  }

  if (entidade === 'pessoas') {
    if (!reg.ativo || !reg.data_nascimento) return null;
    var m = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(reg.data_nascimento);
    if (!m) return null;
    var ano = m[1] === '-' ? null : Number(m[1]);
    var mes = m[2];
    var dia = m[3];
    var inicioAno = ano || 2000;
    var bissexto = mes === '02' && dia === '29';
    var inicio = inicioAno + '-' + mes + '-' + (bissexto && !(inicioAno % 4 === 0) ? '28' : dia);
    return {
      agenda: 'aniversarios',
      evento: {
        summary: '🎂 ' + nomeDaPessoa(reg),
        description: ano ? 'Nascimento: ' + dia + '/' + mes + '/' + ano : '',
        start: { date: inicio },
        end: { date: somarUmDia(inicio) },
        // 29/02 → último dia de fevereiro (28 em anos não bissextos) — RN32
        recurrence: [bissexto ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY'],
        transparency: 'transparent',
        // Lembrete na véspera às 9h (o dia inteiro começa à 0h; 15 h antes = 9h do dia anterior)
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 * 60 }] },
      },
    };
  }

  return null;
}

/** Chaves ("entidade:id") que precisam ser reenviadas ao Google quando um registro muda. */
function dependentesGoogle(entidade, reg, todos) {
  var chaves = [];
  if (entidade === 'compromissos') {
    chaves.push('compromissos:' + reg.id);
    if (reg.serie_id) chaves.push('compromissos:' + reg.serie_id); // o EXDATE da série muda
  } else if (entidade === 'eventos') {
    chaves.push('eventos:' + reg.id);
  } else if (entidade === 'pessoas') {
    chaves.push('pessoas:' + reg.id);
    // O título das férias usa o nome da pessoa
    (todos.eventos || []).forEach(function (e) { if (e.pessoa_id === reg.id) chaves.push('eventos:' + e.id); });
  }
  return chaves;
}

if (typeof module !== 'undefined') {
  module.exports = {
    AGENDAS: AGENDAS,
    regraParaGoogle: regraParaGoogle,
    montarEventoGoogle: montarEventoGoogle,
    dependentesGoogle: dependentesGoogle,
  };
}
