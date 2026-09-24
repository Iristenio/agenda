// Servidor local que imita o Apps Script (mesmo núcleo: backend/nucleo.js), para testes.
// Uso: node scripts/servidor-falso.mjs  → imprime um código de conexão para http://localhost:8787
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nucleo = require('../../backend/nucleo.js');
const TOKEN = 'token-de-teste';
const PORTA = 8787;
const tabelas = Object.fromEntries(Object.keys(nucleo.ESQUEMA).map((e) => [e, nucleo.tabelaEmMemoria()]));

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.end('Agenda API (falsa) ativa');
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const r = JSON.parse(corpo);
    const resposta =
      r.token !== TOKEN
        ? { ok: false, erro: 'Token inválido', codigo: 401 }
        : { ...nucleo.processar(tabelas, r, new Date().toISOString()), planilha: 'https://docs.google.com/spreadsheets/d/exemplo' };
    delete resposta.log;
    console.log(r.acao, (r.operacoes ?? []).length, 'operações');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(resposta));
  });
}).listen(PORTA, () => {
  const codigo = 'AGENDA1:' + Buffer.from(JSON.stringify({ u: `http://localhost:${PORTA}/exec`, t: TOKEN })).toString('base64url');
  console.log('Código de conexão:', codigo);
});
