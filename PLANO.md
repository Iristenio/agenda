# Agenda Pessoal — Plano de Implementação

> Versão 1.0 · 24/09/2026 · Baseado na [ESPECIFICACAO.md](ESPECIFICACAO.md) v0.3

---

## 1. Princípios do plano

1. **Toda fase termina com algo usável no tablet.** Cada fase é publicada no GitHub Pages e testada no Tab S6 Lite antes de começar a próxima.
2. **Primeiro o app, depois o Google.** As fases 1–3 funcionam 100% offline, sem backend. A integração entra quando a interface já estiver aprovada.
3. **Regras de negócio isoladas e testadas.** Recorrência, férias, aniversários e conflitos ficam em módulos "puros" (sem tela), com testes automáticos — é onde os erros custam mais caro.
4. **Nada de dado pessoal no repositório.** O código é público; dados e token ficam só no tablet e na sua conta Google.

---

## 2. Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | **TypeScript** | Detecta erros de digitação e de tipos antes de rodar |
| Build / servidor local | **Vite** | Rápido e simples |
| Interface | **Preact** | Mesmo modelo do React, mas ~4 KB — ideal para tablet |
| PWA / offline | **vite-plugin-pwa** (Workbox) | Gera o Service Worker e o manifesto de instalação |
| Banco local | **IndexedDB** via `idb` | Armazenamento robusto no navegador |
| Datas | **date-fns** + locale pt-BR | Formatação e cálculos em português |
| Recorrência | **rrule** | Padrão RFC 5545, o mesmo do Google |
| Testes | **Vitest** | Testes das regras de negócio |
| Backend | **Google Apps Script** + **clasp** | Código do backend fica versionado no projeto e é enviado ao Google por linha de comando |
| Publicação | **GitHub Actions → GitHub Pages** | Cada `git push` publica automaticamente |

Ferramentas já instaladas no PC: Node 24, npm 11, Git 2.55. ✔

---

## 3. Estrutura de pastas

```
AGENDA/
├── ESPECIFICACAO.md
├── PLANO.md
├── .github/workflows/deploy.yml     ← publicação automática no GitHub Pages
├── app/                             ← frontend (PWA)
│   ├── public/                      ← ícones, manifesto
│   └── src/
│       ├── dominio/                 ← REGRAS DE NEGÓCIO (sem tela) + testes
│       │   ├── tipos.ts             ← Compromisso, Tarefa, Evento, Pessoa...
│       │   ├── recorrencia.ts       ← RN14, RN15, RN23
│       │   ├── compromissos.ts      ← RN10–RN13
│       │   ├── tarefas.ts           ← RN20–RN26
│       │   ├── aniversarios.ts      ← RN30–RN33
│       │   └── ferias.ts            ← RN34–RN36
│       ├── dados/                   ← IndexedDB, repositórios, fila de sync
│       ├── sync/                    ← comunicação com o backend (RS01–RS10)
│       └── ui/
│           ├── layout/              ← menu lateral, painel lateral, botão "+"
│           ├── telas/               ← Hoje, Calendário, Tarefas, Equipe, Config
│           └── componentes/         ← botões, campos, seletor de recorrência...
└── backend/                         ← Google Apps Script (via clasp)
    ├── api.ts                       ← doPost: autenticação por token + roteamento
    ├── planilha.ts                  ← gravação nas abas
    ├── calendario.ts                ← Google Calendar
    ├── tarefas.ts                   ← Google Tasks (envio e retorno)
    └── appsscript.json              ← permissões e serviços avançados
```

---

## 4. Fases

Tamanho relativo: **P** pequena · **M** média · **G** grande.

### Fase 0 — Fundação `P`
**Objetivo:** o "esqueleto" do app instalado no tablet, abrindo sem internet.

Tarefas:
- [x] Criar o projeto (Vite + Preact + TypeScript) e o repositório Git.
- [x] Configurar PWA: manifesto, ícones, Service Worker, modo tela cheia.
- [x] Layout base em paisagem: menu lateral (Hoje · Calendário · Tarefas · Equipe · Config), área principal, painel lateral direito, botão "+".
- [x] Adaptação para retrato (menu no rodapé).
- [x] Tema claro/escuro seguindo o sistema.
- [x] Aviso "Nova versão disponível — Atualizar".
- [x] Publicação automática no GitHub Pages (workflow pronto; falta criar o repositório).

**👤 Sua parte:** criar o repositório `agenda` (público) no GitHub e ativar o Pages (passo a passo será fornecido); instalar o app no tablet.

**✅ Pronto quando:** o app aparece na tela inicial do tablet, abre em tela cheia **em modo avião** e navega entre as telas (ainda vazias).

---

### Fase 1 — Dados locais e Tarefas `M`
**Objetivo:** primeiro módulo completo e útil no dia a dia.

Tarefas:
- [x] Banco local (IndexedDB) com todas as entidades da especificação §3.
- [x] Repositórios com exclusão lógica (RN01), carimbo de datas (RN02) e "Desfazer" (RN05).
- [x] Registro das alterações na FILA_SYNC (ainda sem envio — só acumula).
- [x] Pedido de armazenamento persistente (RS09).
- [x] Listas de tarefas (criar, renomear, cor, ordem); lista "Geral" padrão.
- [x] Tarefas: criar/editar no painel lateral, prioridade, prazo, concluir com um toque, excluir deslizando.
- [x] Atrasadas em destaque (RN21), concluídas por 7 dias (RN22), ordenação (RN24), arrastar para reordenar.
- [x] Tarefas recorrentes: seletor de recorrência + geração da próxima (RN23, RN26).
- [x] Testes automáticos de `tarefas.ts`, `recorrencia.ts` e do repositório local (32 testes).
- [x] Extra: cartão de tarefas do dia na tela Hoje, com adição rápida.

**✅ Pronto quando:** você consegue usar o app como sua lista de tarefas por alguns dias, offline, sem perder nada ao fechar/reabrir.

---

### Fase 2 — Compromissos e Calendário `G`
**Objetivo:** a agenda propriamente dita.

Tarefas:
- [x] Categorias de compromisso (nome, cor); iniciais: Pessoal, Trabalho, Saúde; criação rápida no formulário.
- [x] Formulário de compromisso no painel lateral (RN10, RN11), com lembretes.
- [x] Visões **Dia · Semana · Mês**; semana como padrão (a última visão usada é lembrada).
- [x] Deslizar para navegar entre períodos; botão "Hoje".
- [x] Tocar num horário vazio cria compromisso de 1 h; tocar, segurar e arrastar escolhe o intervalo.
- [x] Compromissos recorrentes (RN14) com expansão das ocorrências para exibição.
- [x] Editar/excluir série: "só esta / esta e as seguintes / todas" (RN15).
- [x] Alerta de choque de horário (RN12).
- [x] Tarefas com prazo como marcadores no calendário (RN25).
- [x] Testes de `compromissos.ts` e dos casos de série (53 testes no total).
- [x] Extra: agenda do dia na tela Hoje (em curso / próximo / já passou).

**✅ Pronto quando:** você consegue montar sua semana real no tablet, incluindo compromissos recorrentes e alterações pontuais em uma ocorrência.

---

### Fase 3 — Pessoas, Eventos e tela Hoje `M`
**Objetivo:** equipe, aniversários, férias e a tela inicial completa.

Tarefas:
- [ ] Cadastro de pessoas (equipe e contatos), ativar/desativar (RN38).
- [ ] Aniversários gerados automaticamente, com idade e regra do 29/02 (RN30–RN32).
- [ ] Férias pessoais e da equipe; contagem de dias corridos/úteis (RN34).
- [ ] Alertas de sobreposição e de limite de ausentes (RN35, RN36).
- [ ] Alerta de compromisso durante suas férias (RN13).
- [ ] Tela **Equipe**: linha do tempo de férias (estilo Gantt, por mês) + próximos aniversários.
- [ ] Tela **Hoje** em três colunas: agenda do dia · tarefas · radar (aniversários, ausências, alertas).
- [ ] Aniversários e férias também exibidos no calendário.
- [ ] Testes de `aniversarios.ts` e `ferias.ts`.

**✅ Pronto quando:** o app está completo como agenda offline — ao abrir, a tela Hoje mostra tudo o que importa no dia.

> 🏁 **Marco:** fim das fases "só no tablet". Revisão geral da interface antes de integrar com o Google.

---

### Fase 4 — Backend, Planilha e Sincronização `M`
**Objetivo:** dados salvos na sua conta Google; backup e restauração.

Tarefas:
- [ ] Projeto Apps Script com clasp, versionado em `backend/`.
- [ ] Criação automática da planilha com todas as abas (§3 da especificação), cabeçalhos e formatação.
- [ ] API `doPost` com validação de token; operações idempotentes por `id` (RS04); registro em LOG_SYNC.
- [ ] Motor de sincronização no app: envio em ordem, compactação, novas tentativas com intervalo crescente (RS02, RS03, RS06).
- [ ] Indicador de sincronização 🟢🟡⚪🔴 no menu lateral (RS07).
- [ ] Tela **Configurações**: URL do backend, token, "Sincronizar agora", "Restaurar da planilha" (RS08).
- [ ] Carga inicial: tudo o que foi criado nas fases 1–3 é enviado à planilha.

**👤 Sua parte:** autorizar o clasp na sua conta Google (uma vez), autorizar as permissões do script, colar URL e token no tablet.

**✅ Pronto quando:** algo criado offline no tablet aparece na planilha poucos segundos após a internet voltar; apagar os dados do app e "Restaurar" recupera tudo.

---

### Fase 5 — Google Calendar `G`
**Objetivo:** compromissos, aniversários e férias no Google Calendar (app → Google).

Tarefas:
- [ ] Ativar o serviço avançado do Calendar; criar/reaproveitar os calendários "Aniversários", "Férias – Pessoais", "Férias – Equipe" (§2.1).
- [ ] Criar/alterar/excluir compromissos simples, com lembretes (RN16).
- [ ] Séries recorrentes via RRULE; alterações de ocorrência única (instâncias) e exclusões (EXDATE).
- [ ] "Esta e as seguintes": encerrar série original + criar nova.
- [ ] Desligar sincronização de um item remove o evento do Google (RN17).
- [ ] Aniversários como eventos anuais; férias como eventos de dia inteiro (RN37).
- [ ] Testes manuais roteirizados (checklist) comparando app × Google Calendar.

**✅ Pronto quando:** tudo o que aparece no calendário do app aparece igual no Google Calendar do celular, inclusive séries com exceções — e os lembretes do Google tocam.

---

### Fase 6 — Google Tasks (duas direções) `M`
**Objetivo:** tarefas espelhadas no Google Tasks, com retorno.

Tarefas:
- [ ] Ativar o serviço avançado do Tasks; criar as listas correspondentes.
- [ ] Envio: tarefas, prioridade como prefixo nas notas, conclusão.
- [ ] Retorno: alterações desde o cursor (RT01, RS10) — conclusão, título, notas, prazo, exclusão, lista.
- [ ] Tarefas e listas novas criadas no Google entram no app (RT03, RT09).
- [ ] Regras de prazo, prioridade, recorrência e conflito (RT04–RT07).
- [ ] Testes de conflito (alterar a mesma tarefa nos dois lados offline).

**✅ Pronto quando:** concluir uma tarefa no Google Tasks do celular faz ela aparecer concluída no tablet na próxima sincronização — e vice-versa.

---

### Fase 7 — Refinamento `P`
- [ ] Ajustes de usabilidade a partir do uso real.
- [ ] Desempenho com muitos dados (ex.: 2 anos de compromissos).
- [ ] Exportar backup em arquivo (JSON) pelo app.
- [ ] Manual de uso curto (`MANUAL.md`).

---

## 5. Como vamos testar

| Onde | Como |
|---|---|
| **PC** | Servidor local (`npm run dev`) com o navegador simulando a tela do tablet (1333×800). Usado durante o desenvolvimento. |
| **Regras de negócio** | Testes automáticos (`npm test`) a cada alteração nos módulos de `dominio/`. |
| **Tablet** | Cada `git push` publica no GitHub Pages em ~1 minuto; o app instalado mostra "Nova versão disponível". |
| **Offline** | Teste em modo avião ao fim de cada fase. |
| **Google** | Uma conta/calendários de teste podem ser usados nas fases 5–6 antes de ligar nos calendários reais (recomendado). |

> Obs.: o Service Worker só funciona em HTTPS, por isso o teste no tablet é sempre pelo endereço do GitHub Pages, e não pelo IP do PC.

---

## 6. Riscos e cuidados

| Risco | Mitigação |
|---|---|
| Séries recorrentes com exceções no Google ficarem diferentes do app | Fase 5 é a maior; checklist de casos + testar primeiro em calendário de teste |
| Perda de dados locais no tablet | Armazenamento persistente (RS09) + planilha como backup (fase 4) + exportação (fase 7) |
| Vazamento do token | Token nunca vai para o repositório; pode ser trocado a qualquer momento na aba CONFIG |
| Cotas do Apps Script | Uso individual fica muito abaixo dos limites diários do Google |
| Repositório público | Contém apenas código; nenhum dado pessoal |

---

## 7. Ordem de execução resumida

```
F0 Fundação ─► F1 Tarefas ─► F2 Calendário ─► F3 Equipe/Hoje ─► 🏁 revisão
                                                                   │
        F7 Refinamento ◄─ F6 Google Tasks ◄─ F5 Google Calendar ◄─ F4 Backend/Planilha
```
