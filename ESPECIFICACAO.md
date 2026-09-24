# Agenda Pessoal — Especificação

> Versão 0.3 · 24/09/2026 · Status: **especificação fechada — pronta para o plano de implementação**

---

## 0. Decisões tomadas

| # | Tema | Decisão |
|---|---|---|
| D1 | Armazenamento | Google Sheets (espelho/backup) + Google Apps Script (backend) |
| D2 | Usuários | Uso individual (somente o dono) |
| D3 | Google Calendar | Sincronização **unidirecional**: app → Google |
| D4 | Calendários | Calendários separados por assunto (ver §2.1) |
| D5 | Tarefas | Sincronizar com **Google Tasks** nas **duas direções** (ver §2.2) |
| D6 | Offline | O app deve funcionar **sem internet** |
| D7 | Dispositivo | **Samsung Galaxy Tab S6 Lite** (Android, Chrome), **prioritariamente em paisagem** |
| D8 | Hospedagem | Frontend no **GitHub Pages** (conta existente) |
| D9 | Lembretes | Notificações ficam a cargo do **Google Calendar** (o app não envia notificações próprias) |

---

## 1. Arquitetura

### 1.1 Impacto do requisito offline

O Apps Script sozinho **não suporta offline**: as páginas que ele serve rodam em um iframe
do Google, onde não é possível registrar *Service Worker* nem garantir armazenamento local.

Por isso o app será dividido em duas partes:

```
┌──────────────────────── TABLET ────────────────────────┐
│  PWA (app instalado na tela inicial)                   │
│   • Interface (HTML/CSS/JS)                            │
│   • Service Worker → app abre sem internet             │
│   • IndexedDB → FONTE DA VERDADE dos dados             │
│   • Fila de sincronização (outbox)                     │
└───────────────┬────────────────────────────────────────┘
                │ quando houver internet (HTTPS + token)
                ▼
┌──────────── GOOGLE APPS SCRIPT (API) ──────────────────┐
│  doPost → valida token → aplica operações              │
│   ├─► Google Sheets   (espelho / backup / restauração) │
│   ├─► Google Calendar (compromissos e eventos)         │
│   └─► Google Tasks    (tarefas)                        │
└────────────────────────────────────────────────────────┘
```

- **Frontend (PWA):** hospedado no **GitHub Pages**. O repositório precisa ser **público** no plano gratuito
  do GitHub, o que é aceitável porque ele contém apenas código — **nenhum dado pessoal, nem o token**.
  No Chrome do Android o app é instalado pelo menu "Adicionar à tela inicial / Instalar app".
- **Backend (Apps Script):** publicado como Web App "executar como: eu". Toda requisição exige um
  **token secreto**, informado uma única vez no tablet na configuração inicial.
- **Planilha:** cópia fiel dos dados. Serve para backup, consulta manual e para restaurar
  o app em outro dispositivo.

### 1.2 Bibliotecas previstas
- `rrule.js` — cálculo de recorrências (padrão RFC 5545, o mesmo do Google).
- `idb` — acesso simplificado ao IndexedDB.
- Sem framework pesado; possivelmente Preact/Lit ou JS puro (a definir na fase de código).

---

## 2. Integração com o Google

### 2.1 Google Calendar — calendários separados

O Apps Script **pode criar calendários** na conta. Na configuração inicial o app cria (ou
reaproveita, se já existirem):

| Calendário | Conteúdo | Cor sugerida |
|---|---|---|
| **Principal** (já existente) | Compromissos | padrão da conta |
| **Aniversários** | Aniversários das pessoas cadastradas | rosa |
| **Férias – Pessoais** | Suas férias | verde |
| **Férias – Equipe** | Férias dos membros da equipe | laranja |

- Os IDs dos calendários ficam guardados na aba `CONFIG`.
- Por categoria de compromisso será possível escolher outro calendário de destino (opcional, futuro).
- Recorrência é enviada como `RRULE` via **Calendar Advanced Service**.
- Como a sincronização é unidirecional, **alterações feitas diretamente no Google serão
  sobrescritas** na próxima alteração daquele item no app. Recomendação: tratar os
  calendários "Aniversários" e "Férias" como somente leitura no Google.

### 2.2 Google Tasks — sincronização nas duas direções

A API do Google Tasks permite consultar **apenas o que mudou desde uma data** (`updatedMin`),
incluindo tarefas concluídas e excluídas. Isso torna a via de volta (Google → app) simples e barata.

**Mapeamento de campos**

| App | Google Tasks | Observação |
|---|---|---|
| Lista | Lista de tarefas (tasklist) | Criada automaticamente |
| Título | title | — |
| Descrição | notes | — |
| Prazo | due | ⚠️ O Google Tasks **só guarda a data** e ignora o horário |
| Prioridade | — | Não existe no Google; vai como prefixo nas notas (ex.: `[ALTA]`) |
| Recorrência | — | ⚠️ A API não expõe recorrência; **o app gera a próxima tarefa** (RN23) |
| Concluída | status = completed | — |
| Subtarefa | parent | Suportado (fase futura) |

**Regras da via de volta (Google Tasks → app)**
- **RT01** — A cada sincronização, o backend busca as tarefas alteradas no Google desde a última consulta
  (em todas as listas criadas pelo app).
- **RT02** — O que é importado: **conclusão/reabertura, título, notas, prazo, exclusão e mudança de lista**.
- **RT03** — **Tarefa nova criada no Google** → é criada no app (prioridade média, sem recorrência).
- **RT04** — **Prazo:** como o Google não guarda horário, se a *data* não mudou o app mantém o horário que já tinha;
  se a data mudou, o horário é descartado.
- **RT05** — **Prioridade:** o prefixo `[ALTA]` / `[BAIXA]` nas notas é interpretado de volta; sem prefixo = mantém a atual.
- **RT06** — **Recorrência:** concluir no Google uma tarefa recorrente faz o app gerar a próxima (RN23)
  e enviá-la ao Google.
- **RT07** — **Conflito** (mesma tarefa alterada nos dois lados antes de sincronizar): vence a alteração
  **mais recente**, comparando `atualizado_em` do app com `updated` do Google. Exceção: conclusão sempre vence
  edição de texto (nunca "desconcluir" por acidente).
- **RT08** — Excluir no Google → tarefa vai para `excluida` no app (recuperável, RN01).
- **RT09** — Listas criadas diretamente no Google Tasks são importadas como novas LISTAS.

> O **Google Calendar continua unidirecional** (app → Google). Os calendários criados pelo app
> devem ser tratados como somente leitura no Google.

---

## 3. Modelo de dados

Convenções: `id` = UUID gerado no tablet · datas em ISO 8601 · fuso da `CONFIG`.
Cada entidade é um *object store* no IndexedDB e uma aba na planilha.

### 3.1 COMPROMISSOS
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | uuid | ✔ | |
| titulo | texto | ✔ | |
| descricao | texto | | |
| local | texto | | |
| inicio | data-hora | ✔ | |
| fim | data-hora | ✔ | Padrão: início + 1h |
| dia_inteiro | bool | ✔ | |
| categoria_id | uuid | | → CATEGORIAS |
| rrule | texto | | Regra de recorrência (RFC 5545) |
| serie_id | uuid | | Preenchido em ocorrências avulsas de uma série |
| ocorrencia_original | data-hora | | Qual ocorrência da série esta exceção substitui |
| excecoes | lista de datas | | Ocorrências excluídas da série (EXDATE) |
| lembretes | lista de minutos | | Ex.: [10, 60] |
| sync_google | bool | ✔ | Padrão: sim |
| google_event_id | texto | | Retornado pelo backend |
| status | enum | ✔ | ativo · cancelado · excluido |
| criado_em / atualizado_em | data-hora | ✔ | |

### 3.2 TAREFAS
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | uuid | ✔ | |
| titulo | texto | ✔ | |
| descricao | texto | | |
| lista_id | uuid | ✔ | → LISTAS (padrão: "Geral") |
| prioridade | enum | ✔ | alta · media · baixa (padrão: media) |
| prazo | data | | AAAA-MM-DD |
| prazo_hora | hora | | HH:mm (opcional; o Google Tasks não guarda hora) |
| rrule | texto | | Recorrência da tarefa (DTSTART + RRULE) |
| status | enum | ✔ | pendente · andamento · concluida · excluida |
| concluida_em | data-hora | | |
| ordem | número | ✔ | Ordenação manual |
| tarefa_origem_id | uuid | | Tarefa recorrente que gerou esta |
| proxima_gerada_id | uuid | | Próxima ocorrência já criada (evita duplicar ao reabrir e concluir de novo) |
| sync_google | bool | ✔ | Padrão: sim |
| google_task_id | texto | | |
| criado_em / atualizado_em | data-hora | ✔ | |

### 3.3 EVENTOS (férias e outros períodos)
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | uuid | ✔ | |
| tipo | enum | ✔ | ferias_pessoais · ferias_equipe · outro |
| titulo | texto | | Gerado automaticamente se vazio (ex.: "Férias – Ana") |
| pessoa_id | uuid | | Obrigatório para férias da equipe |
| data_inicio / data_fim | data | ✔ | Inclusivo |
| observacoes | texto | | |
| sync_google | bool | ✔ | |
| google_event_id | texto | | |
| status | enum | ✔ | ativo · excluido |
| criado_em / atualizado_em | data-hora | ✔ | |

> Aniversários **não** são registros em EVENTOS: são gerados a partir de `PESSOAS.data_nascimento` (RN30).

### 3.4 PESSOAS
| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | uuid | ✔ | |
| nome | texto | ✔ | |
| apelido | texto | | Nome exibido, se preenchido |
| data_nascimento | data | | Ano opcional (pode ser só dia/mês) |
| da_equipe | bool | ✔ | |
| cargo | texto | | |
| cor | hex | | Cor na linha do tempo de férias |
| google_aniversario_id | texto | | Evento anual no calendário "Aniversários" |
| ativo | bool | ✔ | Desativar oculta a pessoa sem apagar o histórico |
| criado_em / atualizado_em | data-hora | ✔ | |

### 3.5 CATEGORIAS (compromissos) e LISTAS (tarefas)
`id, nome, cor, icone, ordem, ativo`

### 3.6 CONFIG (chave → valor)
fuso_horario · primeiro_dia_semana · duracao_padrao_min · lembrete_padrao_min ·
dias_aviso_aniversario · dias_manter_concluidas · limite_ausentes_equipe ·
ids dos calendários Google · id da lista padrão do Google Tasks · data da última sincronização

### 3.7 FILA_SYNC (somente no tablet) e LOG_SYNC (somente na planilha)
- **FILA_SYNC:** `id, entidade, registro_id, operacao (criar/alterar/excluir), payload, tentativas, ultimo_erro, criado_em`
- **LOG_SYNC:** `data_hora, entidade, registro_id, operacao, resultado, mensagem`

---

## 4. Regras de negócio

### 4.1 Gerais
- **RN01** — Não há exclusão física: excluir muda `status` para `excluido`. Itens excluídos há mais de 90 dias podem ser removidos em uma limpeza manual.
- **RN02** — Toda alteração atualiza `atualizado_em`.
- **RN03** — Todas as datas usam o fuso da CONFIG (padrão `America/Sao_Paulo`).
- **RN04** — Toda gravação é feita **primeiro no tablet** e depois colocada na fila de sincronização. A interface nunca espera pela internet.
- **RN05** — Excluir mostra a opção **"Desfazer"** por alguns segundos.

### 4.2 Compromissos
- **RN10** — Título e início são obrigatórios; `fim > inicio`.
- **RN11** — Em compromissos de dia inteiro, os horários são ignorados; podem durar vários dias.
- **RN12** — Choque de horário com outro compromisso gera **alerta**, sem bloquear.
- **RN13** — Compromisso durante suas férias (ferias_pessoais) gera **alerta**.
- **RN14** — Recorrência: diária · semanal (escolha dos dias) · mensal (dia N, ou "2ª terça") · anual · a cada N dias/semanas/meses. Término: nunca · em uma data · após N ocorrências.
- **RN15** — Editar ou excluir uma ocorrência de série pergunta o alcance:
  - **Só esta:** cria exceção (`serie_id` + `ocorrencia_original`), ou adiciona a data em `excecoes` se for exclusão.
  - **Esta e as seguintes:** encerra a série original na véspera (`UNTIL`) e cria uma série nova a partir desta ocorrência.
  - **Todas:** altera a série inteira; exceções já existentes são preservadas.
- **RN16** — Com `sync_google = sim`, as operações são replicadas no Google na mesma lógica (instância, divisão da série ou série inteira).
- **RN17** — Desligar `sync_google` em um item já sincronizado **remove** o evento do Google (mediante confirmação).
- **RN18** — Ocorrências de uma série são identificadas pela **data original** (no máximo uma por dia). `excecoes` guarda datas "AAAA-MM-DD".
- **RN19** — "Esta e as seguintes" na primeira ocorrência equivale a "Todas". Alterações feitas separadamente em ocorrências futuras deixam de valer ao dividir a série. Se a série terminava após N vezes, o total é mantido (a nova série fica com as restantes).
- **RN19a** — Editar em "Todas" a partir de uma ocorrência do meio aplica a mudança de horário como deslocamento sobre a série inteira. Remover a repetição em "Todas" transforma a série num compromisso único na data editada.
- **RN19b** — Categorias iniciais: Pessoal, Trabalho, Saúde. Excluir uma categoria deixa seus compromissos sem categoria.

### 4.3 Tarefas
- **RN20** — Só o título é obrigatório; a lista padrão é "Geral".
- **RN21** — Tarefa com prazo vencido e não concluída aparece como **atrasada** (vermelho).
- **RN22** — Concluir registra `concluida_em`. Concluídas ficam visíveis (riscadas) por `dias_manter_concluidas` (padrão: 7) e depois vão para o histórico.
- **RN23** — Concluir uma tarefa recorrente **gera a próxima** automaticamente, com o prazo calculado pela `rrule` a partir do prazo anterior (não da data de conclusão).
- **RN24** — Ordenação padrão: atrasadas → prioridade → prazo → ordem manual. É possível arrastar para reordenar dentro da mesma prioridade.
- **RN25** — Tarefas com prazo aparecem no calendário como marcadores do dia, sem ocupar horário.
- **RN26** — Reabrir uma tarefa concluída limpa `concluida_em` e **não** apaga a próxima ocorrência já gerada. Concluir de novo não gera outra.
  (Já o botão "Desfazer", logo após concluir, desfaz tudo — inclusive a próxima ocorrência.)
- **RN27** — A lista "Geral" é fixa e não pode ser excluída. Excluir outra lista move suas tarefas para "Geral". Nomes de lista não se repetem.
- **RN28** — Tarefa recorrente exige prazo; ao escolher uma repetição sem prazo, o prazo passa a ser hoje.

### 4.4 Eventos, aniversários e férias
- **RN30** — Cada pessoa com `data_nascimento` gera um aniversário anual, exibido no calendário e replicado como evento anual no calendário "Aniversários".
- **RN31** — Se o ano de nascimento for conhecido, o app mostra a idade que a pessoa vai completar.
- **RN32** — Quem nasceu em 29/02 é exibido em 28/02 nos anos não bissextos.
- **RN33** — Aniversários aparecem na tela "Hoje" a partir de `dias_aviso_aniversario` (padrão: 3) dias antes.
- **RN34** — Férias: `data_fim >= data_inicio`. O app exibe **dias corridos** e **dias úteis** (seg–sex, descontando feriados, se cadastrados no futuro).
- **RN35** — Alerta se o mesmo membro tiver períodos de férias sobrepostos.
- **RN36** — Alerta se mais de `limite_ausentes_equipe` pessoas estiverem de férias no mesmo dia.
- **RN37** — Férias pessoais → calendário "Férias – Pessoais"; férias da equipe → "Férias – Equipe". Ambas como eventos de dia inteiro.
- **RN38** — Desativar uma pessoa oculta seus aniversários futuros (e os remove do Google), mas mantém o histórico de férias.

---

## 5. Funcionamento offline e sincronização

- **RS01** — O app abre e funciona completamente sem internet (Service Worker + IndexedDB).
- **RS02** — Cada alteração gera um item na **FILA_SYNC**. Alterações seguidas no mesmo registro são compactadas (só a versão mais recente é enviada).
- **RS03** — Ao voltar a internet (e também ao abrir o app, e a cada 5 minutos enquanto estiver aberto), a fila é enviada **em ordem**.
- **RS04** — O backend é **idempotente**: ele usa o `id` (UUID) do registro, então reenviar a mesma operação não cria duplicatas.
- **RS05** — O backend devolve os IDs do Google (`google_event_id`, `google_task_id`), que são gravados no registro local.
- **RS06** — Em caso de falha, tenta de novo com intervalo crescente. Após 5 falhas o item fica marcado com erro e aparece um aviso na tela.
- **RS07** — Um indicador fixo mostra o estado: 🟢 sincronizado · 🟡 N pendentes · ⚪ offline · 🔴 erro.
- **RS08** — **Restauração:** em um dispositivo novo (ou com os dados apagados), o app baixa tudo da planilha.
- **RS09** — O app pede ao navegador **armazenamento persistente**, para que o sistema não apague os dados locais
  (no Chrome/Android isso é concedido automaticamente quando o app está instalado na tela inicial).
- **RS10** — Cada ciclo de sincronização tem duas etapas: **1) enviar** a fila local; **2) receber** as alterações
  do Google Tasks (RT01). A etapa 2 guarda um "cursor" (data da última consulta) na CONFIG.

---

## 6. Interface — foco em tablet paisagem

### 6.0 Dispositivo-alvo
Galaxy Tab S6 Lite: tela de 10,4" (2000×1200). No Chrome isso equivale a uma área útil de cerca de
**1333×800 px em paisagem** (≈ 800×1333 em retrato). Esse é o tamanho de referência do layout.
A **S Pen** funciona como toque; os alvos grandes (§6.3) garantem precisão com dedo ou caneta.

### 6.1 Estrutura (paisagem, ≥ 1024 px de largura)
```
┌────┬──────────────────────────────────────────────┬─────────────────┐
│ 🏠 │                                              │                 │
│ 📅 │           ÁREA PRINCIPAL                     │  PAINEL LATERAL │
│ ✅ │   (linha do tempo / calendário / listas)     │  (detalhe ou    │
│ 👥 │                                              │   formulário)   │
│ ⚙️ │                                              │                 │
│    │                                        [ + ] │                 │
│ 🟢 │                                              │                 │
└────┴──────────────────────────────────────────────┴─────────────────┘
 menu                                                 abre pela direita
 lateral                                              sem sair da tela
```
- **Menu lateral fixo** à esquerda (ícones grandes), em vez de abas no rodapé — aproveita a largura.
- **Formulários e detalhes abrem em painel lateral à direita**, sem esconder o calendário. Isso permite ver os conflitos de horário enquanto se agenda.
- **Botão "+"** flutuante no canto inferior direito da área principal → Compromisso · Tarefa · Férias · Pessoa.
- Em modo retrato, o layout se adapta: o menu vai para o rodapé e o painel ocupa a tela inteira.

### 6.2 Telas
1. **Hoje:** três colunas — *Agenda do dia* (linha do tempo) · *Tarefas* (atrasadas + hoje + sem prazo) · *Radar* (aniversários próximos, quem está de férias, alertas).
2. **Calendário:** visões Dia · Semana (padrão na paisagem) · Mês. Deslizar o dedo navega entre períodos; tocar e arrastar num horário vazio cria um compromisso naquele intervalo.
3. **Tarefas:** listas em colunas ou lista única com filtros; concluir com um toque no círculo e excluir deslizando.
4. **Equipe:** cadastro de pessoas + **linha do tempo de férias** (estilo Gantt, por mês) + próximos aniversários.
5. **Configurações:** preferências, conexão com o Google (token, calendários), sincronização e backup.

### 6.3 Diretrizes
- Alvos de toque ≥ 48 px; fonte base de 16–18 px.
- Cores das categorias sempre acompanhadas de texto ou ícone (não depender só da cor).
- Tema claro e escuro, seguindo o sistema.
- Nenhuma ação destrutiva sem confirmação ou "Desfazer".

---

## 7. Fora do escopo desta versão (futuro)
- Importar eventos criados diretamente no Google (sincronização bidirecional).
- Cadastro de feriados para o cálculo de dias úteis.
- Subtarefas.
- Notificações push no tablet (os lembretes, por ora, vêm do próprio Google Calendar).
- Anexos.

---

## 8. Pendências
Nenhuma. (P1–P4 resolvidas → decisões D5, D7, D8, D9.)

## 9. Histórico
- **0.1** — Proposta inicial.
- **0.2** — Arquitetura offline (PWA + Apps Script), calendários separados, Google Tasks, layout paisagem.
- **0.3** — Tablet definido (Tab S6 Lite), GitHub Pages, Google Tasks bidirecional (RT01–RT09), lembretes via Google.
