import { Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { LineBasedState } from ".";

type Severity = Diagnostic["severity"];
type SeverityForLine = Map<number, Severity>;

// TODO: this should be a package-wide type
type RangesWithState = {
  state: EditorState;
  ranges: Array<{ from: number; to: number }>;
};

class DiagnosticState extends LineBasedState<Severity> {
  public constructor({ ranges, state }: RangesWithState) {
    super();

    forEachDiagnostic(state, (diagnostic, from, to) => {
      // Find the start and end lines for the diagnostic
      const lineStart = this.findLine(from, ranges);
      const lineEnd = this.findLine(to, ranges);

      // Populate each line in the range with the highest severity diagnostic
      let severity = diagnostic.severity;
      for (let i = lineStart; i <= lineEnd; i++) {
        const previous = this.get(i);
        if (previous) {
          severity = [severity, previous].sort(this.sort).slice(0, 1)[0];
        }
        this.set(i, severity);
      }
    });
  }

  /**
   * Sorts severity from most to least severe, where
   * error > warning > info
   */
  private sort(a: Severity, b: Severity) {
    return (
      (b === "error" ? 3 : b === "warning" ? 2 : 1) -
      (a === "error" ? 3 : a === "warning" ? 2 : 1)
    );
  }

  /**
   * Given a position and a set of line ranges, return
   * the line number the position falls within
   */
  private findLine(pos: number, ranges: Array<{ from: number; to: number }>) {
    const index = ranges.findIndex((range) => {
      return range.from <= pos && range.to >= pos;
    });

    // Line numbers begin at 1
    return index + 1;
  }
}

export function diagnostics(input: RangesWithState): DiagnosticState {
  return new DiagnosticState(input);
}
