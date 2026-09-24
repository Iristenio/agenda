import { useEffect, useState } from 'preact/hooks';
import { aoMudarSync, lerEstadoSync, type EstadoSync } from './motor';

export function useSync(): EstadoSync {
  const [estado, setEstado] = useState(lerEstadoSync);
  useEffect(() => aoMudarSync(setEstado), []);
  return estado;
}

export const ROTULO_STATUS: Record<EstadoSync['status'], string> = {
  desconectado: 'Só neste aparelho',
  offline: 'Offline',
  sincronizando: 'Sincronizando…',
  sincronizado: 'Sincronizado',
  pendente: 'Pendente',
  erro: 'Erro',
};

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function descreverUltimaSync(iso: string | null, agora = new Date()): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const minutos = Math.round((agora.getTime() - d.getTime()) / 60_000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  if (d.toDateString() === agora.toDateString()) return `hoje às ${fmtHora.format(d)}`;
  return fmtData.format(d);
}
