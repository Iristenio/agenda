import { describe, expect, it } from 'vitest';
import {
  aniversarioNoAno,
  aniversariosEntre,
  descreverAniversario,
  escreverNascimento,
  iniciais,
  lerNascimento,
  novaPessoa,
  proximoAniversario,
  validarPessoa,
} from './pessoas';

let seq = 0;
const p = (nasc: string | null, campos = {}) => novaPessoa({ id: `p${++seq}`, nome: 'Ana Souza', data_nascimento: nasc, ...campos });

describe('nascimento', () => {
  it('lê e escreve com e sem ano', () => {
    expect(lerNascimento('1990-03-15')).toEqual({ ano: 1990, mes: 3, dia: 15 });
    expect(lerNascimento('--03-15')).toEqual({ ano: null, mes: 3, dia: 15 });
    expect(escreverNascimento({ ano: null, mes: 3, dia: 5 })).toBe('--03-05');
  });
  it('rejeita datas impossíveis', () => {
    expect(lerNascimento('1990-02-30')).toBeNull();
    expect(lerNascimento('1991-02-29')).toBeNull();
    expect(lerNascimento('--02-29')).not.toBeNull(); // sem ano: 29/02 é possível
    expect(validarPessoa({ nome: 'a', data_nascimento: '1990-13-01' })).toHaveLength(1);
    expect(validarPessoa({ nome: ' ', data_nascimento: null })).toHaveLength(1);
  });
});

describe('aniversários (RN30–RN32)', () => {
  it('29/02 vira 28/02 em ano não bissexto', () => {
    const n = lerNascimento('2000-02-29')!;
    expect(aniversarioNoAno(n, 2027)).toBe('2027-02-28');
    expect(aniversarioNoAno(n, 2028)).toBe('2028-02-29');
  });

  it('calcula a idade que completa, quando o ano é conhecido', () => {
    const [a] = aniversariosEntre([p('1990-10-02')], '2026-09-24', '2026-12-31');
    expect(a).toMatchObject({ data: '2026-10-02', idade: 36 });
    const [b] = aniversariosEntre([p('--10-02')], '2026-09-24', '2026-12-31');
    expect(b.idade).toBeNull();
  });

  it('ignora pessoas inativas (RN38) e sem data', () => {
    expect(aniversariosEntre([p('1990-10-02', { ativo: false }), p(null)], '2026-01-01', '2026-12-31')).toHaveLength(0);
  });

  it('atravessa a virada do ano', () => {
    const lista = aniversariosEntre([p('--01-05'), p('--12-30')], '2026-12-01', '2027-01-31');
    expect(lista.map((a) => a.data)).toEqual(['2026-12-30', '2027-01-05']);
  });

  it('próximo aniversário: hoje conta; senão, no ano seguinte', () => {
    expect(proximoAniversario(p('--09-24'), '2026-09-24')?.data).toBe('2026-09-24');
    expect(proximoAniversario(p('--09-23'), '2026-09-24')?.data).toBe('2027-09-23');
  });

  it('descrição amigável', () => {
    const [a] = aniversariosEntre([p('1990-09-25')], '2026-09-24', '2026-09-30');
    expect(descreverAniversario(a, '2026-09-24')).toBe('amanhã · 36 anos');
  });

  it('iniciais', () => {
    expect(iniciais({ nome: 'Ana Maria Souza', apelido: '' })).toBe('AS');
    expect(iniciais({ nome: 'Ana', apelido: 'Aninha' })).toBe('A');
    expect(iniciais({ nome: 'Maria (mãe)', apelido: '' })).toBe('MM');
  });
});
