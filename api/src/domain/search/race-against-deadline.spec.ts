import {
  GLOBAL_TIMEOUT_MARKER,
  raceAgainstDeadline,
} from './race-against-deadline';

describe('raceAgainstDeadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('promise resolve antes do deadline: devolve o valor dela, onLateArrival nunca é chamado', async () => {
    const onLateArrival = jest.fn();

    const result = await raceAgainstDeadline<string>(
      Promise.resolve('value'),
      1000,
      onLateArrival,
    );

    expect(result).toBe('value');

    await jest.advanceTimersByTimeAsync(1000);
    expect(onLateArrival).not.toHaveBeenCalled();
  });

  it('promise resolve antes do deadline: o timer interno é limpo (não fica pendente no event loop)', async () => {
    await raceAgainstDeadline<string>(Promise.resolve('value'), 1000);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('deadline vence antes da promise: devolve GLOBAL_TIMEOUT_MARKER e loga chegada tardia quando a promise resolve depois', async () => {
    let resolvePromise!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const onLateArrival = jest.fn();

    const racePromise = raceAgainstDeadline(promise, 1000, onLateArrival);

    await jest.advanceTimersByTimeAsync(1000);
    await expect(racePromise).resolves.toBe(GLOBAL_TIMEOUT_MARKER);
    expect(onLateArrival).not.toHaveBeenCalled();

    resolvePromise('late value');
    await Promise.resolve();
    await Promise.resolve();

    expect(onLateArrival).toHaveBeenCalledWith('late value');
  });

  it('sem onLateArrival: deadline vence sem lançar, mesmo comportamento sem o callback', async () => {
    let resolvePromise!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const racePromise = raceAgainstDeadline(promise, 1000);

    await jest.advanceTimersByTimeAsync(1000);
    await expect(racePromise).resolves.toBe(GLOBAL_TIMEOUT_MARKER);

    resolvePromise('late value');
    await Promise.resolve();
    await Promise.resolve();
  });
});
