import { EditorView } from "@codemirror/view";

// TODO: renamed this file because something's weird with codemirror build

export abstract class LineBasedState<TValue> {
  protected map: Map<number, TValue>;
  protected view: EditorView;

  public constructor(view: EditorView) {
    this.map = new Map();
    this.view = view;
  }

  public get(lineNumber: number): TValue | undefined {
    return this.map.get(lineNumber);
  }

  protected set(lineNumber: number, value: TValue) {
    this.map.set(lineNumber, value);
  }
}
