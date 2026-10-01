import { useRegisterSW } from 'virtual:pwa-register/preact';

let registroSW: ServiceWorkerRegistration | undefined;
let aplicarAtualizacao: ((recarregar?: boolean) => Promise<void>) | undefined;

export type ResultadoAtualizacao = 'atualizando' | 'em_dia' | 'indisponivel';

/**
 * Procura uma versão nova agora (botão em Ajustes). Se houver, instala e recarrega o app.
 * Existe porque o aviso "Nova versão disponível" pode ser fechado sem querer.
 */
export async function procurarAtualizacao(): Promise<ResultadoAtualizacao> {
  const reg = registroSW;
  if (!reg || !aplicarAtualizacao) return 'indisponivel';
  try {
    await reg.update();
  } catch {
    return 'indisponivel'; // sem internet
  }
  // Se começou a baixar, espera terminar (até 20 s)
  const instalando = reg.installing;
  if (instalando) {
    await new Promise<void>((ok) => {
      const fim = setTimeout(ok, 20_000);
      instalando.addEventListener('statechange', () => {
        if (instalando.state === 'installed' || instalando.state === 'redundant') {
          clearTimeout(fim);
          ok();
        }
      });
    });
  }
  if (!reg.waiting) return 'em_dia';
  await aplicarAtualizacao(true);
  return 'atualizando';
}

/** Mostra "Nova versão disponível" quando uma atualização do app foi baixada. */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      registroSW = registro;
      // Verifica novas versões a cada hora enquanto o app estiver aberto
      if (registro) setInterval(() => registro.update(), 60 * 60 * 1000);
    },
  });
  aplicarAtualizacao = updateServiceWorker;

  if (!precisaAtualizar) return null;

  return (
    <div class="aviso" role="status">
      Nova versão disponível
      <button class="botao" onClick={() => updateServiceWorker(true)}>
        Atualizar
      </button>
      <button class="botao-icone" style={{ color: 'inherit' }} onClick={() => setPrecisaAtualizar(false)} aria-label="Depois">
        ✕
      </button>
    </div>
  );
}
