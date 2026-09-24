// Servidor local que imita o Apps Script (mesmo núcleo: backend/nucleo.js), para testes.
// Uso: node scripts/servidor-falso.mjs  → imprime um código de conexão para http://localhost:8787
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nucleo = require('../../backend/nucleo.js');
const TOKEN = 'token-de-teste';
const PORTA = 8787;
const tabelas = Object.fromEntries(Object.keys(nucleo.ESQUEMA).map((e) => [e, nucleo.tabelaEmMemoria()]));

const AGENDAS = [
  { id: 'eu@unilab.edu.br', nome: 'Iristenio (UNILAB)', cor: '#039be5', principal: true, acesso: 'owner' },
  { id: 'pessoal@gmail.com', nome: 'Agenda pessoal (Gmail)', cor: '#8e24aa', principal: false, acesso: 'writer' },
  { id: 'feriados', nome: 'Feriados no Brasil', cor: '#0b8043', principal: false, acesso: 'reader' },
];

/** Eventos de exemplo: hoje e amanhã, em cada agenda pedida. */
function externosDeExemplo(agendas) {
  const hoje = new Date();
  const d = (dias) => {
    const x = new Date(hoje);
    x.setDate(x.getDate() + dias);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const todos = [
    { agenda_id: 'eu@unilab.edu.br', id: 'r1', titulo: 'Reunião do colegiado', local: 'Sala de reuniões', inicio: `${d(0)}T14:30`, fim: `${d(0)}T16:00`, dia_inteiro: false, livre: false },
    { agenda_id: 'eu@unilab.edu.br', id: 'r2', titulo: 'Banca de TCC', local: 'Auditório', inicio: `${d(1)}T09:00`, fim: `${d(1)}T11:00`, dia_inteiro: false, livre: false },
    { agenda_id: 'pessoal@gmail.com', id: 'p1', titulo: 'Academia', local: '', inicio: `${d(0)}T18:00`, fim: `${d(0)}T19:00`, dia_inteiro: false, livre: false },
    { agenda_id: 'feriados', id: 'f1', titulo: 'Feriado de exemplo', local: '', inicio: `${d(2)}T00:00`, fim: `${d(2)}T23:59`, dia_inteiro: true, livre: true },
  ];
  return todos
    .filter((e) => agendas.includes(e.agenda_id))
    .map((e) => ({ ...e, id: `${e.agenda_id}|${e.id}`, link: 'https://calendar.google.com/' }));
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.end('Agenda API (falsa) ativa');
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const r = JSON.parse(corpo);
    let resposta;
    if (r.token !== TOKEN) resposta = { ok: false, erro: 'Token inválido', codigo: 401 };
    else if (r.acao === 'agendas') resposta = { ok: true, agendas: AGENDAS };
    else {
      resposta = { ...nucleo.processar(tabelas, r, new Date().toISOString()), planilha: 'https://docs.google.com/spreadsheets/d/exemplo' };
      if (r.externos) resposta.externos = { itens: externosDeExemplo(r.externos.agendas), falhas: [], em: new Date().toISOString() };
    }
    delete resposta.log;
    console.log(r.acao, (r.operacoes ?? []).length, 'operações');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(resposta));
  });
}).listen(PORTA, () => {
  const codigo = 'AGENDA1:' + Buffer.from(JSON.stringify({ u: `http://localhost:${PORTA}/exec`, t: TOKEN })).toString('base64url');
  console.log('Código de conexão:', codigo);
});
