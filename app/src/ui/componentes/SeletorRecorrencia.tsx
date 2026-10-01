// Seletor de recorrência (RN14) — reutilizado por tarefas e, na etapa 2, por compromissos.
import { descrever, ehDiaUtilDoMes, flutuante, posicaoNoMes, recorrenciaPadrao, type Frequencia, type Recorrencia } from '../../dominio/recorrencia';

interface Props {
  valor: Recorrencia | null;
  inicio: string; // data (ou data-hora) da primeira ocorrência
  aoMudar: (r: Recorrencia | null) => void;
}

const OPCOES: { valor: Frequencia | 'nao'; rotulo: string }[] = [
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'diaria', rotulo: 'Diária' },
  { valor: 'semanal', rotulo: 'Semanal' },
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'anual', rotulo: 'Anual' },
];

const UNIDADE: Record<Frequencia, [string, string]> = {
  diaria: ['dia', 'dias'],
  semanal: ['semana', 'semanas'],
  mensal: ['mês', 'meses'],
  anual: ['ano', 'anos'],
};

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function SeletorRecorrencia({ valor, inicio, aoMudar }: Props) {
  const d = flutuante(inicio);
  const mudar = (parcial: Partial<Recorrencia>) => valor && aoMudar({ ...valor, ...parcial });
  const pos = posicaoNoMes(d.getUTCDate());
  const posTexto = pos === -1 ? 'último(a)' : `${pos}º(ª)`;

  return (
    <div class="recorrencia">
      <div class="segmentado" role="radiogroup" aria-label="Repetição">
        {OPCOES.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={(valor?.freq ?? 'nao') === o.valor}
            onClick={() => aoMudar(o.valor === 'nao' ? null : recorrenciaPadrao(o.valor, inicio))}
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      {valor && (
        <div class="recorrencia-detalhes">
          <label class="linha">
            A cada
            <input
              type="number"
              min={1}
              max={99}
              class="campo campo-curto"
              value={valor.intervalo}
              onInput={(e) => mudar({ intervalo: Math.max(1, Number(e.currentTarget.value) || 1) })}
            />
            {UNIDADE[valor.freq][valor.intervalo === 1 ? 0 : 1]}
          </label>

          {valor.freq === 'semanal' && (
            <div class="dias-semana" role="group" aria-label="Dias da semana">
              {DIAS.map((letra, i) => {
                const marcado = valor.dias_semana.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={marcado}
                    aria-label={DIAS_NOMES[i]}
                    onClick={() => {
                      const dias = marcado ? valor.dias_semana.filter((x) => x !== i) : [...valor.dias_semana, i];
                      if (dias.length) mudar({ dias_semana: dias });
                    }}
                  >
                    {letra}
                  </button>
                );
              })}
            </div>
          )}

          {valor.freq === 'mensal' && (
            <div class="chips" role="radiogroup" aria-label="Dia do mês">
              <button type="button" class="chip" role="radio" aria-checked={valor.mensal_modo === 'dia'} aria-pressed={valor.mensal_modo === 'dia'} onClick={() => mudar({ mensal_modo: 'dia' })}>
                No dia {d.getUTCDate()}
              </button>
              <button type="button" class="chip" role="radio" aria-checked={valor.mensal_modo === 'posicao'} aria-pressed={valor.mensal_modo === 'posicao'} onClick={() => mudar({ mensal_modo: 'posicao' })}>
                No {posTexto} {DIAS_NOMES[d.getUTCDay()]}
              </button>
              <button type="button" class="chip" role="radio" aria-checked={valor.mensal_modo === 'primeiro_util'} aria-pressed={valor.mensal_modo === 'primeiro_util'} onClick={() => mudar({ mensal_modo: 'primeiro_util' })}>
                No primeiro dia útil
              </button>
              <button type="button" class="chip" role="radio" aria-checked={valor.mensal_modo === 'ultimo_util'} aria-pressed={valor.mensal_modo === 'ultimo_util'} onClick={() => mudar({ mensal_modo: 'ultimo_util' })}>
                No último dia útil
              </button>
            </div>
          )}
          {ehDiaUtilDoMes(valor) && (
            <p class="dica">Dia útil = segunda a sexta (feriados não são descontados).</p>
          )}

          <div class="linha">
            Termina
            <select
              class="campo"
              value={valor.fim}
              onChange={(e) => {
                const fim = e.currentTarget.value as Recorrencia['fim'];
                mudar({
                  fim,
                  ate: fim === 'data' ? (valor.ate ?? inicio.slice(0, 10)) : null,
                  contagem: fim === 'contagem' ? (valor.contagem ?? 10) : null,
                });
              }}
            >
              <option value="nunca">nunca</option>
              <option value="data">em uma data</option>
              <option value="contagem">após algumas vezes</option>
            </select>
            {valor.fim === 'data' && (
              <input type="date" class="campo" value={valor.ate ?? ''} min={inicio.slice(0, 10)} onInput={(e) => mudar({ ate: e.currentTarget.value || null })} />
            )}
            {valor.fim === 'contagem' && (
              <>
                <input
                  type="number"
                  min={1}
                  max={999}
                  class="campo campo-curto"
                  value={valor.contagem ?? 10}
                  onInput={(e) => mudar({ contagem: Math.max(1, Number(e.currentTarget.value) || 1) })}
                />
                vezes
              </>
            )}
          </div>

          <p class="resumo">🔁 {descrever(valor, inicio)}</p>
        </div>
      )}
    </div>
  );
}
