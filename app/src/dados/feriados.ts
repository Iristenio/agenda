// Carrega o mapa de feriados unificado (Google + cadastrados − "não é folga") para uso fora das telas.
import type { AgendaGoogle } from '../dominio/tipos';
import { montarFeriados, type MapaFeriados } from '../dominio/feriados';
import { somarDias } from '../dominio/datas';
import { lerInterno, listarExternos, listarTodos } from './repositorio';

/**
 * A agenda conta como feriado? Vale a escolha do usuário; sem escolha, as agendas de feriados
 * do Google (id com "holiday") contam automaticamente.
 */
export function agendaContaFeriado(a: AgendaGoogle): boolean {
  return a.feriados ?? /holiday/i.test(a.id);
}

export function idsAgendasFeriado(agendas: AgendaGoogle[]): Set<string> {
  return new Set(agendas.filter(agendaContaFeriado).map((a) => a.id));
}

export async function carregarMapaFeriados(de: string, ate: string): Promise<MapaFeriados> {
  const [feriados, externos, agendas] = await Promise.all([
    listarTodos('feriados'),
    listarExternos(),
    lerInterno<AgendaGoogle[]>('_agendas_externas'),
  ]);
  return montarFeriados(feriados, externos, idsAgendasFeriado(agendas ?? []), de, ate);
}

/** Feriados dos próximos ~15 meses a partir de uma data (o que o app conhece do Google vai até ~13 meses). */
export const carregarFeriadosAFrente = (de: string) => carregarMapaFeriados(de, somarDias(de, 460));
