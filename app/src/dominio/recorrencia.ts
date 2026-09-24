// Recorrência (RN14) no padrão RFC 5545 — o mesmo usado pelo Google Calendar.
//
// Convenção: a biblioteca rrule trabalha em UTC. Usamos datas "flutuantes": a hora local
// é gravada como se fosse UTC (ex.: 09:00 local → 09:00Z). Assim nunca há deslocamento de fuso.
import { RRule, rrulestr, type Options, type Weekday } from 'rrule';

export type Frequencia = 'diaria' | 'semanal' | 'mensal' | 'anual';

export interface Recorrencia {
  freq: Frequencia;
  intervalo: number;           // a cada N (dias/semanas/meses/anos)
  dias_semana: number[];       // 0 = domingo … 6 = sábado (só semanal)
  mensal_modo: 'dia' | 'posicao'; // dia 15 · ou "2ª terça"
  fim: 'nunca' | 'data' | 'contagem';
  ate: string | null;          // AAAA-MM-DD (inclusivo)
  contagem: number | null;
}

const FREQ: Record<Frequencia, number> = {
  diaria: RRule.DAILY,
  semanal: RRule.WEEKLY,
  mensal: RRule.MONTHLY,
  anual: RRule.YEARLY,
};

const DIAS_RRULE: Weekday[] = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];

/** "AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm" → Date flutuante (UTC com os números locais). */
export function flutuante(texto: string): Date {
  const [data, hora = '00:00'] = texto.split('T');
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  return new Date(Date.UTC(a, m - 1, d, h, min));
}

function dataDeFlutuante(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dataHoraDeFlutuante(d: Date): string {
  return d.toISOString().slice(0, 16);
}

/** Posição da semana no mês: 1ª…4ª, ou -1 (última) quando cai na 5ª semana. */
export function posicaoNoMes(dia: number): number {
  const n = Math.ceil(dia / 7);
  return n >= 5 ? -1 : n;
}

export function recorrenciaPadrao(freq: Frequencia, inicio: string): Recorrencia {
  const d = flutuante(inicio);
  return {
    freq,
    intervalo: 1,
    dias_semana: freq === 'semanal' ? [d.getUTCDay()] : [],
    mensal_modo: 'dia',
    fim: 'nunca',
    ate: null,
    contagem: null,
  };
}

/** Gera o texto "DTSTART:…\nRRULE:…" a partir da recorrência e da data/hora inicial. */
export function paraRRule(rec: Recorrencia, inicio: string): string {
  const dtstart = flutuante(inicio);
  const opcoes: Partial<Options> = {
    freq: FREQ[rec.freq],
    interval: Math.max(1, rec.intervalo || 1),
    dtstart,
  };

  if (rec.freq === 'semanal') {
    const dias = rec.dias_semana.length ? rec.dias_semana : [dtstart.getUTCDay()];
    opcoes.byweekday = [...dias].sort().map((d) => DIAS_RRULE[d]);
  }
  if (rec.freq === 'mensal' && rec.mensal_modo === 'posicao') {
    opcoes.byweekday = [DIAS_RRULE[dtstart.getUTCDay()].nth(posicaoNoMes(dtstart.getUTCDate()))];
  }
  if (rec.fim === 'data' && rec.ate) {
    opcoes.until = new Date(flutuante(rec.ate).getTime() + 86_399_000); // até 23:59:59
  }
  if (rec.fim === 'contagem' && rec.contagem) {
    opcoes.count = rec.contagem;
  }
  return new RRule(opcoes).toString();
}

/** Converte o texto RRULE de volta para o formato do formulário. */
export function deRRule(texto: string): Recorrencia {
  const o = rrulestr(texto).origOptions;
  const freq = (Object.keys(FREQ) as Frequencia[]).find((f) => FREQ[f] === o.freq) ?? 'diaria';
  const dias = ([] as (Weekday | number | string)[]).concat(o.byweekday ?? []);
  const temPosicao = dias.some((d) => typeof d === 'object' && d.n);
  return {
    freq,
    intervalo: o.interval ?? 1,
    dias_semana:
      freq === 'semanal'
        ? dias.map((d) => ((typeof d === 'object' ? d.weekday : Number(d)) + 1) % 7)
        : [],
    mensal_modo: freq === 'mensal' && temPosicao ? 'posicao' : 'dia',
    fim: o.until ? 'data' : o.count ? 'contagem' : 'nunca',
    ate: o.until ? dataDeFlutuante(o.until) : null,
    contagem: o.count ?? null,
  };
}

/** Data de início (DTSTART) gravada na regra. */
export function inicioDaRegra(texto: string): string {
  return dataHoraDeFlutuante(rrulestr(texto).origOptions.dtstart!);
}

/** Próxima ocorrência (data) estritamente depois de `depoisDe`. `null` se a série terminou. */
export function proximaData(texto: string, depoisDe: string): string | null {
  const regra = rrulestr(texto);
  const limite = new Date(flutuante(depoisDe).getTime() + 86_399_000); // fim do dia
  const prox = regra.after(limite, false);
  return prox ? dataDeFlutuante(prox) : null;
}

/** Todas as ocorrências (data-hora local "AAAA-MM-DDTHH:mm") entre duas datas, inclusive. */
export function ocorrenciasEntre(texto: string, de: string, ate: string): string[] {
  const regra = rrulestr(texto);
  const fim = new Date(flutuante(ate).getTime() + 86_399_000);
  return regra.between(flutuante(de), fim, true).map(dataHoraDeFlutuante);
}

/* ---------------- Descrição em português ---------------- */

const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const NOMES_DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ORDINAIS: Record<number, string> = { 1: '1º', 2: '2º', 3: '3º', 4: '4º', [-1]: 'último' };
const ORDINAIS_F: Record<number, string> = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª', [-1]: 'última' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function descrever(rec: Recorrencia, inicio: string): string {
  const d = flutuante(inicio);
  const n = rec.intervalo;
  let texto: string;

  switch (rec.freq) {
    case 'diaria':
      texto = n === 1 ? 'Todos os dias' : `A cada ${n} dias`;
      break;
    case 'semanal': {
      const dias = [...rec.dias_semana].sort();
      const util = dias.join() === '1,2,3,4,5';
      const lista = util ? 'dias úteis' : dias.map((x) => NOMES_DIAS[x]).join(', ');
      texto = n === 1 ? `Toda semana: ${lista}` : `A cada ${n} semanas: ${lista}`;
      if (util && n === 1) texto = 'Todos os dias úteis';
      break;
    }
    case 'mensal': {
      const base = n === 1 ? 'Todo mês' : `A cada ${n} meses`;
      if (rec.mensal_modo === 'posicao') {
        const pos = posicaoNoMes(d.getUTCDate());
        const dia = d.getUTCDay();
        const ord = dia === 0 || dia === 6 ? ORDINAIS[pos] : ORDINAIS_F[pos];
        texto = `${base}, no ${ord} ${NOMES_DIAS_LONGOS[dia]}`.replace('no última', 'na última').replace(/no (\dª)/, 'na $1');
      } else {
        texto = `${base}, no dia ${d.getUTCDate()}`;
      }
      break;
    }
    case 'anual':
      texto = `${n === 1 ? 'Todo ano' : `A cada ${n} anos`}, em ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
      break;
  }

  if (rec.fim === 'data' && rec.ate) {
    const [a, m, dia] = rec.ate.split('-');
    texto += `, até ${dia}/${m}/${a}`;
  } else if (rec.fim === 'contagem' && rec.contagem) {
    texto += `, ${rec.contagem} vezes`;
  }
  return texto;
}
