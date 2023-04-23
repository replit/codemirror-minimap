import { Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { LineBasedState } from ".";
import { DrawContext, RangesWithState } from "./selections";
import { EditorView } from "@codemirror/view";

type Severity = Diagnostic["severity"];
type SeverityForLine = Map<number, Severity>;

// TODO: Global config
const SCALE = 1;

export class DiagnosticState extends LineBasedState<Severity> {
  public constructor(view: EditorView) {
    super(view);
  }

  public update({ lines, update }: RangesWithState) {
    //      // TODO: Save this to put into diag to save on re-comp
    // let updatedDiagnostics = false;
    // for (const tr of update.transactions) {
    //   for (const ef of tr.effects) {
    //     if (ef.is(setDiagnosticsEffect)) {
    //       updatedDiagnostics = true;
    //     }
    //   }
    // }

    this.map.clear();

    forEachDiagnostic(update.state, (diagnostic, from, to) => {
      // Find the start and end lines for the diagnostic
      const lineStart = this.findLine(from, lines);
      const lineEnd = this.findLine(to, lines);

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

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const { context, lineHeight, charWidth, offsetY } = ctx;
    const severity = this.get(lineNumber);
    if (!severity) {
      return;
    }

    // TODO: Collapsed severity probably doesn't work

    // Draw the full line width rectangle in the background
    context.globalAlpha = 0.8;
    context.beginPath();
    context.rect(
      0,
      offsetY,
      context.canvas.width * SCALE /* Why? */,
      lineHeight
    );
    context.fillStyle = this.color(severity);
    context.fill();

    // Draw diagnostic range rectangle in the foreground
    // TODO: We need to update the state to have specific ranges
    // context.globalAlpha = 1;
    // context.beginPath();
    // context.rect(offsetX, offsetY, textWidth, lineHeight);
    // context.fillStyle = this.color(severity);
    // context.fill();
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

  // TODO: Does this need to be customized?
  private color(severity: Severity) {
    return severity === "error"
      ? "red"
      : severity === "warning"
      ? "yellow"
      : "blue";
  }
}

export function diagnostics(view: EditorView): DiagnosticState {
  return new DiagnosticState(view);
}
