export const GLOBAL_TIMEOUT_MARKER = Symbol('GLOBAL_TIMEOUT_MARKER');

/**
 * Corre `promise` contra um timer de `deadlineMs`. Se `promise` resolver primeiro, devolve o
 * valor dela. Se o timer vencer primeiro, devolve `GLOBAL_TIMEOUT_MARKER` — sem cancelar
 * `promise`, que continua rodando em background. Se `onLateArrival` foi passado e o timer venceu,
 * é chamado com o valor de `promise` quando ela eventualmente resolver (nunca chamado se
 * `promise` venceu a corrida). `promise` nunca deve rejeitar (contrato de `getQuotes` das
 * DSM-1/2/3) — esta função não trata rejeição.
 */
export function raceAgainstDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  onLateArrival?: (result: T) => void,
): Promise<T | typeof GLOBAL_TIMEOUT_MARKER> {
  const timeout = new Promise<typeof GLOBAL_TIMEOUT_MARKER>((resolve) => {
    setTimeout(() => resolve(GLOBAL_TIMEOUT_MARKER), deadlineMs);
  });

  return Promise.race([promise, timeout]).then((result) => {
    if (result === GLOBAL_TIMEOUT_MARKER && onLateArrival) {
      void promise.then(onLateArrival);
    }

    return result;
  });
}
