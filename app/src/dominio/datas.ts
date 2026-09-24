// Utilitários de data no horário LOCAL do tablet.
// Datas "puras" (sem hora) circulam como texto "AAAA-MM-DD" para evitar erros de fuso.

const dois = (n: number) => String(n).padStart(2, '0');

export function paraDataISO(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function paraHora(d: Date): string {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function hojeISO(agora = new Date()): string {
  return paraDataISO(agora);
}

/** "AAAA-MM-DD" → Date à meia-noite local. */
export function deDataISO(texto: string): Date {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(texto: string, dias: number): string {
  const d = deDataISO(texto);
  d.setDate(d.getDate() + dias);
  return paraDataISO(d);
}

/** Diferença em dias corridos (b - a). */
export function diferencaDias(a: string, b: string): number {
  const ms = deDataISO(b).getTime() - deDataISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/* ---- Data-hora local "AAAA-MM-DDTHH:mm" (aritmética em UTC "flutuante", imune a fuso) ---- */

function deDataHora(texto: string): number {
  const [data, hora = '00:00'] = texto.split('T');
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  return Date.UTC(a, m - 1, d, h, min);
}

export function somarMinutos(texto: string, minutos: number): string {
  return new Date(deDataHora(texto) + minutos * 60_000).toISOString().slice(0, 16);
}

export function diferencaMinutos(a: string, b: string): number {
  return Math.round((deDataHora(b) - deDataHora(a)) / 60_000);
}

export function agoraDataHora(agora = new Date()): string {
  return `${paraDataISO(agora)}T${paraHora(agora)}`;
}

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD". */
export function diaDaSemana(texto: string): number {
  return deDataISO(texto).getDay();
}

/** Primeiro dia da semana que contém a data. */
export function inicioDaSemana(texto: string, primeiroDia: 0 | 1 = 0): string {
  const dif = (diaDaSemana(texto) - primeiroDia + 7) % 7;
  return somarDias(texto, -dif);
}

export function inicioDoMes(texto: string): string {
  return `${texto.slice(0, 7)}-01`;
}

export function somarMeses(texto: string, meses: number): string {
  const d = deDataISO(inicioDoMes(texto));
  d.setMonth(d.getMonth() + meses);
  return paraDataISO(d);
}

export function agoraISO(agora = new Date()): string {
  return agora.toISOString();
}

const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const fmtSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

/** Texto amigável para um prazo: "Hoje", "Amanhã", "Ontem", "sexta", "12 de out." */
export function descreverData(texto: string, hoje = hojeISO()): string {
  const dif = diferencaDias(hoje, texto);
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Amanhã';
  if (dif === -1) return 'Ontem';
  const d = deDataISO(texto);
  if (dif > 1 && dif < 7) return fmtSemana.format(d);
  const base = fmtDiaMes.format(d).replace('.', '');
  return d.getFullYear() === deDataISO(hoje).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
