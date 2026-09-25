// Seletor de horário próprio do app (substitui o <input type="time"> do sistema).
// Motivo: no tablet em paisagem, o diálogo de horário do Android corta os botões OK/Cancelar
// dentro do app instalado. Aqui tudo abre dentro do painel: grade de horas, grade de minutos
// (de 5 em 5) e um campo para digitar o horário exato.
import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  valor: string | null;          // "HH:mm" ou null
  aoMudar: (hora: string | null) => void;
  rotulo?: string;               // para leitores de tela
  opcional?: boolean;            // mostra "Sem hora"
  placeholder?: string;
}

const dois = (n: number) => String(n).padStart(2, '0');
const HORAS = Array.from({ length: 24 }, (_, h) => h);
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);

/** Interpreta o que foi digitado: "930" → 09:30, "1415" → 14:15, "9" → 09:00, "14:5" → 14:05. */
export function interpretarHora(texto: string): string | null {
  const limpo = texto.replace(/[^\d:]/g, '');
  let h: number;
  let m: number;
  if (limpo.includes(':')) {
    const [a, b = '0'] = limpo.split(':');
    if (!a) return null;
    h = Number(a);
    m = Number(b || 0);
  } else {
    if (!limpo) return null;
    if (limpo.length <= 2) {
      h = Number(limpo);
      m = 0;
    } else {
      h = Number(limpo.slice(0, limpo.length - 2));
      m = Number(limpo.slice(-2));
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${dois(h)}:${dois(m)}`;
}

export function CampoHora({ valor, aoMudar, rotulo = 'Horário', opcional, placeholder = '--:--' }: Props) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const hora = valor ? Number(valor.slice(0, 2)) : null;
  const minuto = valor ? Number(valor.slice(3, 5)) : null;

  useEffect(() => {
    if (!aberto) return;
    setDigitado(valor ?? '');
    // Rola o painel até a grade aberta ficar inteira visível — acima do rodapé fixo (Salvar/Excluir)
    setTimeout(() => {
      const el = raiz.current;
      const corpo = el?.closest('.painel-corpo');
      if (!el || !corpo) return el?.scrollIntoView({ block: 'nearest' });
      const rodape = corpo.querySelector('.acoes-form');
      const limite = (rodape?.getBoundingClientRect().top ?? corpo.getBoundingClientRect().bottom) - 12;
      const excesso = el.getBoundingClientRect().bottom - limite;
      if (excesso > 0) corpo.scrollTop += excesso;
    }, 30);
  }, [aberto]);

  function escolher(h: number | null, m: number | null) {
    const novaH = h ?? hora ?? 9;
    const novoM = m ?? minuto ?? 0;
    const texto = `${dois(novaH)}:${dois(novoM)}`;
    setDigitado(texto);
    aoMudar(texto);
  }

  function aoDigitar(texto: string) {
    setDigitado(texto);
    const interpretado = interpretarHora(texto);
    if (interpretado) aoMudar(interpretado);
  }

  const digitadoInvalido = digitado.trim() !== '' && !interpretarHora(digitado);

  return (
    <div class={`campo-hora${aberto ? ' aberto' : ''}`} ref={raiz}>
      <button
        type="button"
        class="campo campo-hora-botao"
        aria-label={`${rotulo}: ${valor ?? 'sem horário'}`}
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        🕐 {valor ?? placeholder}
      </button>

      {aberto && (
        <div class="seletor-hora" role="dialog" aria-label={rotulo}>
          <div class="seletor-hora-topo">
            <input
              class={`campo${digitadoInvalido ? ' invalido' : ''}`}
              inputMode="numeric"
              placeholder="Digite (ex.: 1430)"
              value={digitado}
              onInput={(e) => aoDigitar(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setAberto(false))}
              aria-label="Digitar horário"
            />
            <button type="button" class="botao primario" onClick={() => setAberto(false)}>
              OK
            </button>
          </div>

          <span class="seletor-rotulo">Hora</span>
          <div class="grade-horas-sel">
            {HORAS.map((h) => (
              <button key={h} type="button" aria-pressed={h === hora} onClick={() => escolher(h, null)}>
                {dois(h)}
              </button>
            ))}
          </div>

          <span class="seletor-rotulo">Minuto</span>
          <div class="grade-minutos-sel">
            {MINUTOS.map((m) => (
              <button key={m} type="button" aria-pressed={m === minuto} onClick={() => escolher(null, m)}>
                :{dois(m)}
              </button>
            ))}
          </div>

          {opcional && valor && (
            <button
              type="button"
              class="link esquerda"
              onClick={() => {
                aoMudar(null);
                setAberto(false);
              }}
            >
              Sem horário
            </button>
          )}
        </div>
      )}
    </div>
  );
}
