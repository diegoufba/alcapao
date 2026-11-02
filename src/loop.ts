/** Acumulador de passo fixo: converte o dt real em N passos de `step` segundos. */
export function createStepper(step = 1 / 60, maxFrame = 0.25): { advance(realDt: number): { steps: number; alpha: number } } {
  const EPS = 1e-9; // tolera erro de ponto flutuante ao somar frames
  let acc = 0;
  return {
    advance(realDt: number) {
      acc += Math.min(Math.max(realDt, 0), maxFrame);
      let steps = 0;
      while (acc >= step - EPS) {
        acc -= step;
        steps++;
      }
      acc = Math.max(acc, 0);
      return { steps, alpha: Math.min(acc / step, 1 - EPS) };
    },
  };
}
