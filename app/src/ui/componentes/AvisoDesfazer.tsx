// Aviso temporário no rodapé, com o botão "Desfazer" (RN05).
import { useEstado } from '../estado';

export function AvisoDesfazer() {
  const { aviso, fecharAviso } = useEstado();
  if (!aviso) return null;
  return (
    <div class="aviso aviso-acao" role="status">
      {aviso.texto}
      {aviso.desfazer && (
        <button
          class="botao"
          onClick={async () => {
            fecharAviso();
            await aviso.desfazer!();
          }}
        >
          Desfazer
        </button>
      )}
    </div>
  );
}
