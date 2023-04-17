import { EditorState, SelectionRange } from "@codemirror/state";
import { LineBasedState } from ".";

type Selection = { from: number; to: number; extends: boolean };

// TODO: this should be a package-wide type
type RangesWithState = {
  state: EditorState;
  lines: Array<{ from: number; to: number }>;
};

class SelectionState extends LineBasedState<Array<Selection>> {
  public constructor({ lines, state }: RangesWithState) {
    super();

    let lineIndex = 0;
    for (const range of state.selection.ranges) {
      // Ignore selections of length 0
      if (range.from === range.to) {
        continue;
      }

      // Iterate through lines until we reach the line where the selection begins
      while (lineIndex < lines.length && lines[lineIndex].to < range.from) {
        lineIndex++;
      }

      do {
        // Add the selection to the line map
        const selection = this.buildSelection(range, lines[lineIndex]);
        this.setLine(lineIndex, selection);

        if (selection.extends) {
          // The selection continues to the following line
          lineIndex++;
        } else {
          // We've finished processing this selection
          break;
        }
      } while (lineIndex < lines.length);
    }
  }

  private buildSelection(
    range: SelectionRange,
    line: { from: number; to: number }
  ): Selection {
    return {
      from: Math.max(line.from, range.from) - line.from,
      to: Math.min(line.to, range.to) - line.from,
      extends: range.to > line.to,
    };
  }

  private setLine(index: number, selection: Selection) {
    // Lines are indexed beginning at 1 instead of 0
    const line = index + 1;

    const previous = this.map.get(line);
    this.map.set(line, previous ? previous.concat(selection) : [selection]);
  }
}

export function selections(input: RangesWithState): SelectionState {
  return new SelectionState(input);
}
