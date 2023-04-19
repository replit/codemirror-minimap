import { EditorState, SelectionRange, Text } from "@codemirror/state";
import { LineBasedState } from ".";
import { ViewUpdate } from "@codemirror/view";
import { foldedRanges } from "@codemirror/language";

type Selection = { from: number; to: number; extends: boolean };
type Line = {
  length: number;
  hidden: Array<{ from: number; to: number }>;
};

// TODO: this should be a package-wide type
type RangesWithState = {
  state: EditorState;
  lines: Array<{ from: number; to: number }>;
};

// ViewUpdate -> LineState
// ViewUpdate -> DiagnosticState -> LineState(?) ->

class LinesState extends LineBasedState<Line> {
  public static eq(a: LinesState, b: LinesState) {
    // If foldedRanges eq and document eq, then lines have not changed
  }

  public constructor(update: ViewUpdate) {
    super();

    const doc = Text.of(update.state.doc.toString().split("\n"));
    const foldedRangeCursor = foldedRanges(update.state).iter();

    const lineRanges: Array<{
      from: number;
      to: number;
      hidden: Array<{ from: number; to: number }>; // It's possible to have more than one hidden range within a line...
    }> = [];

    for (let i = 1; i <= doc.lines; i++) {
      let { from: lineFrom, to: lineTo, text: lineText } = doc.line(i);

      // Iterate through folded ranges until we're at or past the current line
      while (foldedRangeCursor.value && foldedRangeCursor.to < lineFrom) {
        foldedRangeCursor.next();
      }

      const { from: foldFrom, to: foldTo } = foldedRangeCursor;
      const lineStartInFold = lineFrom >= foldFrom && lineFrom < foldTo;
      const lineEndInFold = lineTo > foldFrom && lineTo <= foldTo;

      // If the line is fully within the fold we ignore it entirely
      if (lineStartInFold && lineEndInFold) {
        continue;
      }

      // If we have a fold ending part way through the line, the rest of the line will
      // be appended to the previous line
      if (lineStartInFold && !lineEndInFold) {
        let last = lineRanges.pop();
        if (!last) {
          lineRanges.push({ from: lineFrom, to: lineTo });
          continue;
        }
        last.to = lineTo;
        lineRanges.push(last);
        continue;
      }

      // Otherwise, append line data as normal
      lineRanges.push({ from: lineFrom, to: lineTo });
    }
  }
}

export function lines(update: ViewUpdate): LinesState {
  return new LinesState(update);
}
