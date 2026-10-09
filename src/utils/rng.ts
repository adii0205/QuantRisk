/**
 * PCG-32 (Permuted Congruential Generator)
 * A fast, statistically sound pseudo-random number generator with 64-bit state and 32-bit output.
 * Provides seedable reproducible streams for Monte Carlo risk simulations.
 */
export class PCG32 {
  private state: bigint;
  private inc: bigint;

  constructor(seed: number | bigint = 42, stream: number | bigint = 54) {
    this.state = 0n;
    this.inc = (BigInt(stream) << 1n) | 1n;
    this.nextUint32();
    this.state += BigInt(seed);
    this.nextUint32();
  }

  /**
   * Generates next uniform random 32-bit unsigned integer in [0, 2^32 - 1]
   */
  public nextUint32(): number {
    const oldState = this.state;
    // Advance internal state: state = state * 6364136223846793005ULL + inc
    this.state = (oldState * 6364136223846793005n + this.inc) & 0xffffffffffffffffn;

    // Calculate output function (XSH RR: xorshift high, random rotate)
    const xorShifted = Number(((oldState >> 18n) ^ oldState) >> 27n) >>> 0;
    const rot = Number(oldState >> 59n);

    // Rotate right
    return ((xorShifted >>> rot) | (xorShifted << ((-rot) & 31))) >>> 0;
  }

  /**
   * Generates uniform float in [0, 1)
   */
  public uniform(): number {
    return this.nextUint32() / 4294967296.0;
  }

  private cachedNormal: number | null = null;

  /**
   * Generates standard normal random variable N(0,1) via Box-Muller with cached second draw
   */
  public normal(): number {
    if (this.cachedNormal !== null) {
      const val = this.cachedNormal;
      this.cachedNormal = null;
      return val;
    }

    let u1 = this.uniform();
    let u2 = this.uniform();
    while (u1 <= 1e-15) {
      u1 = this.uniform();
    }

    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;

    this.cachedNormal = r * Math.sin(theta);
    return r * Math.cos(theta);
  }

  /**
   * Generates Gamma(k, theta) via Marsaglia and Tsang method for k >= 1
   */
  public gamma(k: number, theta: number = 1): number {
    if (k < 1) {
      // Weibull or Johnk's generator: gamma(k) = gamma(k+1) * U^(1/k)
      const u = Math.max(this.uniform(), 1e-15);
      return this.gamma(k + 1, theta) * Math.pow(u, 1 / k);
    }

    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      const z = this.normal();
      const v = 1 + c * z;
      if (v <= 0) continue;

      const v3 = v * v * v;
      const u = this.uniform();

      // Squeeze test
      if (u < 1 - 0.0331 * z * z * z * z) {
        return d * v3 * theta;
      }

      if (Math.log(Math.max(u, 1e-15)) < 0.5 * z * z + d * (1 - v3 + Math.log(v3))) {
        return d * v3 * theta;
      }
    }
  }

  /**
   * Chi-Squared with nu degrees of freedom: Chi2(nu) = 2 * Gamma(nu/2, 1)
   */
  public chiSquared(nu: number): number {
    return 2.0 * this.gamma(nu / 2, 1.0);
  }
}
