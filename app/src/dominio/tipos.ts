// Entidades do app — espelham a §3 da ESPECIFICACAO.md.
// Datas: "AAAA-MM-DD" (data), "HH:mm" (hora) e ISO completo (carimbos de data-hora).

export type Id = string;

export interface Registro {
  id: Id;
  criado_em: string;
  atualizado_em: string;
}

/* ---------------- Tarefas ---------------- */

export type Prioridade = 'alta' | 'media' | 'baixa';
export type StatusTarefa = 'pendente' | 'andamento' | 'concluida' | 'excluida';

export interface Tarefa extends Registro {
  titulo: string;
  descricao: string;
  lista_id: Id;
  prioridade: Prioridade;
  prazo: string | null;        // AAAA-MM-DD
  prazo_hora: string | null;   // HH:mm (opcional)
  rrule: string | null;        // "DTSTART:...\nRRULE:..." (RFC 5545)
  status: StatusTarefa;
  concluida_em: string | null;
  ordem: number;
  tarefa_origem_id: Id | null;   // tarefa recorrente que gerou esta
  proxima_gerada_id: Id | null;  // próxima ocorrência já criada (evita duplicar ao reconcluir)
  sync_google: boolean;
  google_task_id: string | null;
}

export interface Lista extends Registro {
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  google_tasklist_id: string | null;
}

/* ---------------- Compromissos (etapa 2) ---------------- */

export type StatusCompromisso = 'ativo' | 'cancelado' | 'excluido';

export interface Compromisso extends Registro {
  titulo: string;
  descricao: string;
  local: string;
  inicio: string;              // ISO local "AAAA-MM-DDTHH:mm"
  fim: string;
  dia_inteiro: boolean;
  categoria_id: Id | null;
  rrule: string | null;
  serie_id: Id | null;
  ocorrencia_original: string | null;
  excecoes: string[];
  lembretes: number[];
  sync_google: boolean;
  google_event_id: string | null;
  status: StatusCompromisso;
}

export interface Categoria extends Registro {
  nome: string;
  cor: string;
  icone: string;
  ordem: number;
  ativo: boolean;
}

/* ---------------- Pessoas e eventos (etapa 3) ---------------- */

export interface Pessoa extends Registro {
  nome: string;
  apelido: string;
  data_nascimento: string | null;  // AAAA-MM-DD ou --MM-DD (ano desconhecido)
  da_equipe: boolean;
  cargo: string;
  cor: string;
  google_aniversario_id: string | null;
  ativo: boolean;
}

export type TipoEvento = 'ferias_pessoais' | 'ferias_equipe' | 'outro';

export interface Evento extends Registro {
  tipo: TipoEvento;
  titulo: string;
  pessoa_id: Id | null;
  data_inicio: string;
  data_fim: string;
  observacoes: string;
  sync_google: boolean;
  google_event_id: string | null;
  status: 'ativo' | 'excluido';
}

/* ---------------- Infraestrutura ---------------- */

export type Entidade = 'tarefas' | 'listas' | 'compromissos' | 'categorias' | 'pessoas' | 'eventos';

export interface ItemFila {
  id: Id;
  entidade: Entidade;
  registro_id: Id;
  operacao: 'criar' | 'alterar' | 'excluir';
  payload: Registro;
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
}

export interface Config {
  fuso_horario: string;
  primeiro_dia_semana: 0 | 1;          // 0 = domingo, 1 = segunda
  duracao_padrao_min: number;
  lembrete_padrao_min: number;
  dias_aviso_aniversario: number;
  dias_manter_concluidas: number;
  limite_ausentes_equipe: number;
}

export const CONFIG_PADRAO: Config = {
  fuso_horario: 'America/Sao_Paulo',
  primeiro_dia_semana: 0,
  duracao_padrao_min: 60,
  lembrete_padrao_min: 10,
  dias_aviso_aniversario: 3,
  dias_manter_concluidas: 7,
  limite_ausentes_equipe: 2,
};
