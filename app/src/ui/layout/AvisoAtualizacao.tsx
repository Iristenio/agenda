import { useRegisterSW } from 'virtual:pwa-register/preact';

/** Mostra "Nova versão disponível" quando uma atualização do app foi baixada. */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Verifica novas versões a cada hora enquanto o app estiver aberto
      if (registro) setInterval(() => registro.update(), 60 * 60 * 1000);
    },
  });

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
