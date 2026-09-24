// Pessoas e aniversários (RN30–RN33, RN38).
//
// data_nascimento: "AAAA-MM-DD" (ano conhecido) ou "--MM-DD" (ano desconhecido).
import type { Id, Pessoa } from './tipos';
import { diferencaDias } from './datas';

export function novaPessoa(campos: Partial<Pessoa> & { id: Id }, agora = new Date()): Pessoa {
  const carimbo = agora.toISOString();
  return {
    nome: '',
    apelido: '',
    data_nascimento: null,
    da_equipe: true,
    cargo: '',
    cor: '#2f6fed',
    google_aniversario_id: null,
    ativo: true,
    criado_em: carimbo,
    atualizado_em: carimbo,
    ...campos,
  };
}

export const nomeExibicao = (p: Pick<Pessoa, 'nome' | 'apelido'>) => p.apelido.trim() || p.nome.trim();

export function iniciais(p: Pick<Pessoa, 'nome' | 'apelido'>): string {
  // Só palavras que começam com letra (ignora parênteses, números etc.)
  const partes = nomeExibicao(p)
    .split(/\s+/)
    .map((x) => x.match(/\p{L}/u)?.[0])
    .filter((x): x is string => !!x);
  if (!partes.length) return '?';
  return (partes[0] + (partes.length > 1 ? partes[partes.length - 1] : '')).toUpperCase();
}

export function validarPessoa(p: Pick<Pessoa, 'nome' | 'data_nascimento'>): string[] {
  const erros: string[] = [];
  if (!p.nome.trim()) erros.push('Informe o nome.');
  if (p.data_nascimento && !lerNascimento(p.data_nascimento)) erros.push('Data de nascimento inválida.');
  return erros;
}

/* ---------------- Nascimento ---------------- */

export interface Nascimento {
  ano: number | null;
  mes: number; // 1–12
  dia: number;
}

export function lerNascimento(texto: string): Nascimento | null {
  const m = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const ano = m[1] === '-' ? null : Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano ?? 2000, mes)) return null;
  return { ano, mes, dia };
}

export function escreverNascimento(n: Nascimento): string {
  const mm = String(n.mes).padStart(2, '0');
  const dd = String(n.dia).padStart(2, '0');
  return n.ano ? `${n.ano}-${mm}-${dd}` : `--${mm}-${dd}`;
}

export const ehBissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** RN32 — data do aniversário num ano; 29/02 vira 28/02 em anos não bissextos. */
export function aniversarioNoAno(n: Nascimento, ano: number): string {
  const dia = n.mes === 2 && n.dia === 29 && !ehBissexto(ano) ? 28 : n.dia;
  return `${ano}-${String(n.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export interface Aniversario {
  pessoa: Pessoa;
  data: string;          // AAAA-MM-DD
  idade: number | null;  // idade que completa (RN31)
}

/** RN30/RN38 — aniversários de pessoas ativas entre duas datas (inclusivas). */
export function aniversariosEntre(pessoas: Pessoa[], de: string, ate: string): Aniversario[] {
  const anoIni = Number(de.slice(0, 4));
  const anoFim = Number(ate.slice(0, 4));
  const lista: Aniversario[] = [];
  for (const pessoa of pessoas) {
    if (!pessoa.ativo || !pessoa.data_nascimento) continue;
    const n = lerNascimento(pessoa.data_nascimento);
    if (!n) continue;
    for (let ano = anoIni; ano <= anoFim; ano++) {
      const data = aniversarioNoAno(n, ano);
      if (data < de || data > ate) continue;
      const idade = n.ano ? ano - n.ano : null;
      if (idade !== null && idade < 0) continue;
      lista.push({ pessoa, data, idade });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data) || nomeExibicao(a.pessoa).localeCompare(nomeExibicao(b.pessoa)));
}

/** Próximo aniversário (hoje incluído) de uma pessoa. */
export function proximoAniversario(p: Pessoa, hoje: string): Aniversario | null {
  const ano = Number(hoje.slice(0, 4));
  return aniversariosEntre([p], hoje, `${ano + 1}-12-31`)[0] ?? null;
}

export function descreverAniversario(a: Aniversario, hoje: string): string {
  const faltam = diferencaDias(hoje, a.data);
  const quando = faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`;
  return a.idade !== null ? `${quando} · ${a.idade} anos` : quando;
}
