import { foldEffect, foldedRanges, unfoldEffect } from "@codemirror/language";
import { StateField, EditorState, Transaction } from "@codemirror/state";
import { Config } from "./Config";

type Span = { from: number; to: number; folded: boolean };
type Line = Array<Span>;
type Lines = Array<Line>;

function computeLinesState(state: EditorState): Lines {
  if (!state.facet(Config).enabled) {
    return [];
  }

  const lines: Lines = [];

  const lineCursor = state.doc.iterLines();
  const foldedRangeCursor = foldedRanges(state).iter();

  let textOffset = 0;
  lineCursor.next();

  while (!lineCursor.done) {
    const lineText = lineCursor.value;
    let from = textOffset;
    let to = from + lineText.length;

    // Iterate through folded ranges until we're at or past the current line
    while (foldedRangeCursor.value && foldedRangeCursor.to < from) {
      foldedRangeCursor.next();
    }
    const { from: foldFrom, to: foldTo } = foldedRangeCursor;

    const lineStartInFold = from >= foldFrom && from < foldTo;
    const lineEndsInFold = to > foldFrom && to <= foldTo;

    if (lineStartInFold) {
      let lastLine = lines.pop() ?? [];
      let lastRange = lastLine.pop();

      // If the last range is folded, we extend the folded range
      if (lastRange && lastRange.folded) {
        lastRange.to = foldTo;
      }

      // If we popped the last range, add it back
      if (lastRange) {
        lastLine.push(lastRange);
      }

      // If we didn't have a previous range, or the previous range wasn't folded add a new range
      if (!lastRange || !lastRange.folded) {
        lastLine.push({ from: foldFrom, to: foldTo, folded: true });
      }

      // If the line doesn't end in a fold, we add another token for the unfolded section
      if (!lineEndsInFold) {
        lastLine.push({ from: foldTo, to, folded: false });
      }

      lines.push(lastLine);
    } else if (lineEndsInFold) {
      lines.push([
        { from, to: foldFrom, folded: false },
        { from: foldFrom, to: foldTo, folded: true },
      ]);
    } else {
      lines.push([{ from, to, folded: false }]);
    }

    textOffset = to + 1;
    lineCursor.next();
  }

  return lines;
}

const LinesState = StateField.define<Lines>({
  create: (state) => computeLinesState(state),
  update: (current, tr) => {
    if (foldsChanged([tr]) || tr.docChanged) {
      return computeLinesState(tr.state);
    }

    return current;
  },
});

/** Returns if the folds have changed in this update */
function foldsChanged(transactions: readonly Transaction[]) {
  return transactions.find((tr) =>
    tr.effects.find((ef) => ef.is(foldEffect) || ef.is(unfoldEffect))
  );
}

export { foldsChanged, LinesState, Lines };
