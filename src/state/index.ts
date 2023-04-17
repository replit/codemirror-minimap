export abstract class LineBasedState<TValue> {
  protected map: Map<number, TValue>;

  public constructor() {
    this.map = new Map();
  }

  public get(lineNumber: number): TValue | undefined {
    return this.map.get(lineNumber);
  }

  protected set(lineNumber: number, value: TValue) {
    this.map.set(lineNumber, value);
  }
}
