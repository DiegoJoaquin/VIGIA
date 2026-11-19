// Un color estable por proyecto, para reconocerlo de un vistazo en el calendario y en las listas.
const PALETTE = ['#2f6fdb', '#8a4fd3', '#d6478f', '#0891b2', '#a8643a', '#5d8f1f', '#4f46e5', '#c2410c'];

/** El color depende de la posición del proyecto en la lista de la cuenta, así no cambia al filtrar. */
export function projectColor(projectIds: string[], id: string): string {
  const i = projectIds.indexOf(id);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
