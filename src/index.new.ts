import { foldedRanges, highlightingFor, language } from "@codemirror/language";
import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
  Facet,
  combineConfig,
  StateEffect,
} from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  PluginValue,
} from "@codemirror/view";
import {
  Diagnostic,
  forEachDiagnostic,
  setDiagnosticsEffect,
} from "@codemirror/lint";
import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";
import { overlay } from "./overlay";
import { Config, config as minimapConfig } from "./config";
import { ChangedRange, TreeFragment } from "@lezer/common";
import { DiagnosticState, diagnostics } from "./state/diagnostics";
import { SelectionState, selections } from "./state/selections";
import { TextState, text } from "./state/text";

export type LineData = Array<
  Array<{
    from: number;
    to: number;
    // text: string;
    folded: boolean;
  }>
>;
type LineText = { text: string; tags?: string };
type LineSelection = { from: number; to: number; continues: boolean };
type LineSelectionNew = { from: number; to: number; extends: boolean };

type FontInfo = { color: string; font: string; fontSize: number };
type SelectionInfo = { backgroundColor: string };

const minimapTheme = EditorView.theme({
  "&": {
    height: "100%",
    overflowY: "auto",
  },
  "& .cm-focused": {
    outline: "none",
  },
  "& .cm-content": {
    // overflowX: "auto",
    // flexShrink: 1,
  },
  "& .cm-minimap-gutter": {
    flexShrink: 0,
    position: "sticky",
    top: 0,
    right: 0,
  },
  "& .cm-minimap-container": {
    position: "absolute",
    top: 0,
    right: 0,
    // display: "flex",
    // height: "100%",
  },
});

const CANVAS_MAX_WIDTH = 120;
const SCALE = 3;

export class Minimap implements PluginValue {
  public _gutter: HTMLDivElement;
  /*private*/ public _container: HTMLDivElement;
  /*private*/ public _canvas: HTMLCanvasElement;
  /*private*/ public _view: EditorView;

  // private _cachedTreeFragments: Array<TreeFragment>;

  private _fontInfoMap: Map<string, FontInfo> = new Map();

  public text: TextState;
  public selection: SelectionState;
  public diagnostic: DiagnosticState;

  public lines: Array<
    Array<{
      from: number;
      to: number;
      // text: string;
      folded: boolean;
    }>
  >;

  public constructor(view: EditorView) {
    this._view = view;

    this.lines = [];

    this.text = text(view);
    this.selection = selections(view);
    this.diagnostic = diagnostics(view);

    this._gutter = document.createElement("div");
    // this._gutter.classList.add("cm-minimap-gutter");
    this._gutter.classList.add("cm-gutters");
    this._gutter.style.position = "sticky";
    this._gutter.style.left = "unset";
    this._gutter.style.right = "0px";
    this._gutter.style.top = "0px";
    this._gutter.style.width = CANVAS_MAX_WIDTH + "px";
    this._gutter.style.borderRight = "0px"; // If we could get the gutter border on the left though..

    this._container = document.createElement("div");
    this._container.classList.add("cm-minimap-container");
    // console.log(this._view.dom.style.backgroundColor);

    this._canvas = document.createElement("canvas");
    this._canvas.style.display = "block"; // Needed to prevent minor scroll
    this._canvas.style.maxWidth = CANVAS_MAX_WIDTH + "px";
    this._canvas.addEventListener("click", (e) => {
      // TODO this needs to be updated for overscroll
      const mappedPosition = e.clientY * SCALE * 2 * 1.4;
      const halfEditorHeight = this._view.scrollDOM.clientHeight / 2;
      this._view.scrollDOM.scrollTop = mappedPosition - halfEditorHeight;

      e.preventDefault();
      e.stopPropagation();
    });

    this._container.appendChild(this._canvas);
    this._gutter.appendChild(this._container);
    this._view.scrollDOM.insertBefore(
      this._gutter,
      this._view.contentDOM.nextSibling
    );

    // this._cachedTreeFragments = [];
  }

  /**
   * build lines could have all the line data, then we have different "decorators"
   * off of that line data state
   *
   * - State -> Line Data State
   *
   * --> Decorators:
   *   - Text decorator
   *   - Box decorator
   *   - Selection decorator
   *   - Diagnostics decorator
   *   - (Future) git decorator
   *   - (Future) search decorator
   */

  // public measureFoldedRangeTime(state: EditorState) {
  //   let foldedRangeCursor = foldedRanges(state).iter();
  //   // const highlighter: Highlighter = {
  //   //   style: (tags) => highlightingFor(state, tags),
  //   // };

  //   const lines: Array<LineData> = [];
  //   // let selectionIndex = 0;
  //   const doc = Text.of(state.doc.toString().split("\n"));
  //   const lineRanges: Array<{
  //     from: number;
  //     to: number;
  //     text: string;
  //     folded: Array<{ from: number; to: number }>;
  //   }> = [];

  //   const lineRangesNew: Array<{
  //     from: number;
  //     to: number;
  //     text: string;
  //     folded: boolean;
  //   }> = [];

  //   for (let i = 1; i <= doc.lines; i++) {
  //     let { number: _number, ...line } = doc.line(i);
  //     let folded: Array<{ from: number; to: number }> = [];

  //     // Iterate through folded ranges until we're at or past the current line
  //     while (foldedRangeCursor.value && foldedRangeCursor.to < line.from) {
  //       foldedRangeCursor.next();
  //     }
  //     const { from: foldFrom, to: foldTo } = foldedRangeCursor;

  //     // If our line starts in a fold, we update data to the previous stored line
  //     const lineStartInFold = line.from >= foldFrom && line.from < foldTo;
  //     if (lineStartInFold) {
  //       // console.log(_number, line.from, line.to, foldFrom, foldTo);
  //       // Append to previous data
  //       let last = lineRanges.pop();
  //       if (last) {
  //         line.from = last.from;
  //         line.text = last.text + line.text;
  //         folded = last.folded;
  //       }

  //       // If we haven't already appended this fold
  //       if (folded.length === 0 || folded.slice(-1)[0].to !== foldTo) {
  //         folded.push({ from: foldFrom, to: foldTo });
  //       }
  //     }

  //     lineRanges.push({ ...line, folded });
  //     // lineRangesNew.push([]);
  //   }

  //   console.log("New line ranges", lineRangesNew);

  //   // Reset this, we should consolidate this to not do it twice
  //   // Resetting it fixes the bug where we're not rendering collapsed ranges
  //   foldedRangeCursor = foldedRanges(state).iter();
  // }

  public buildLines(update: ViewUpdate): Array<
    Array<{
      from: number;
      to: number;
      // text: string;
      folded: boolean;
    }>
  > {
    const state = update.state;
    // this.measureFoldedRangeTime(state);

    const parser = state.facet(language)?.parser;
    if (!parser) {
      console.log("TODO: Handle no parser....");
      return [];
    }

    const doc = Text.of(state.doc.toString().split("\n"));

    // // Trying to do incremental parsing. Previously `parse` step would take about 2ms
    // // https://discuss.codemirror.net/t/incremental-syntax-highlighting-with-lezer/3292
    // const changedRanges: Array<ChangedRange> = [];
    // update.changes.iterChangedRanges((fromA, toA, fromB, toB) =>
    //   changedRanges.push({ fromA, toA, fromB, toB })
    // );
    // const changedFragments = TreeFragment.applyChanges(
    //   this._cachedTreeFragments,
    //   changedRanges
    // );
    // const tree = parser.parse(doc.toString(), changedFragments);
    // this._cachedTreeFragments = TreeFragment.addTree(tree);
    // // End trying to do incremental parsing

    let foldedRangeCursor = foldedRanges(state).iter();
    // const highlighter: Highlighter = {
    //   style: (tags) => highlightingFor(state, tags),
    // };

    // const lines: Array<LineData> = [];
    // let selectionIndex = 0;

    // const lineRanges: Array<{
    //   from: number;
    //   to: number;
    //   text: string;
    //   folded: Array<{ from: number; to: number }>;
    // }> = [];

    const lineRangesNew: Array<
      Array<{
        from: number;
        to: number;
        // text: string;
        folded: boolean;
      }>
    > = [];

    for (let i = 1; i <= doc.lines; i++) {
      let { from, to } = doc.line(i);

      // Iterate through folded ranges until we're at or past the current line
      while (foldedRangeCursor.value && foldedRangeCursor.to < from) {
        foldedRangeCursor.next();
      }
      const { from: foldFrom, to: foldTo } = foldedRangeCursor;

      const lineStartInFold = from >= foldFrom && from < foldTo;
      const lineEndsInFold = to > foldFrom && to <= foldTo;

      if (lineStartInFold) {
        let lastLine = lineRangesNew.pop() ?? [];
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

        lineRangesNew.push(lastLine);
        continue;
      }

      if (lineEndsInFold) {
        lineRangesNew.push([
          { from, to: foldFrom, folded: false },
          { from: foldFrom, to: foldTo, folded: true },
        ]);
        continue;
      }

      lineRangesNew.push([{ from, to, folded: false }]);
    }

    // throw new Error("Stop");

    // for (let i = 1; i <= doc.lines; i++) {
    //   let { number: _number, ...line } = doc.line(i);
    //   let folded: Array<{ from: number; to: number }> = [];

    //   // Iterate through folded ranges until we're at or past the current line
    //   while (foldedRangeCursor.value && foldedRangeCursor.to < line.from) {
    //     foldedRangeCursor.next();
    //   }
    //   const { from: foldFrom, to: foldTo } = foldedRangeCursor;
    //   const lineStartInFold = line.from >= foldFrom && line.from < foldTo;
    //   const lineEndInFold = line.to > foldFrom && line.to <= foldTo;

    //   console.log(_number, lineStartInFold, lineEndInFold);

    //   // If we start a line folded, update the previous line's last range
    //   if (lineStartInFold) {
    //     console.log("Line ", _number, "starts in fold");
    //     let previousLine = /*lineRangesNew.pop() ??*/ undefined;
    //     let lastRange = previousLine.pop();

    //     if (lastRange) {
    //       lastRange.to = foldTo;
    //     } else {
    //       lastRange = { from: foldFrom, to: foldTo, folded: true };
    //     }

    //     console.log("Pushing", lastRange);

    //     previousLine.push(lastRange);
    //     // lineRangesNew.push(previousLine);

    //     continue;

    //     //   (last.to = line.to), lineRangesNew.push(last);
    //     // } else {
    //     //   lineRangesNew.push({ from: line.from, to: line.to, folded: true });
    //     // }
    //   }

    //   // lineRangesNew.push([{ from: line.from, to: line.to, folded: false }]);

    //   continue;

    //   // // If we end a line folded
    //   // if (lineEndInFold) {

    //   // }

    //   // // If we start a line folded
    //   // if (lineStartInFold && !lineEndInFold) {

    //   // }

    //   // // If we end a line unfolded,
    //   // if (!lineEndInFold) {
    //   // }

    //   // If we have a fold beginning part way through the line we push
    //   // two separate ranges
    //   if (!lineStartInFold && lineEndInFold) {
    //     lineTo = foldFrom;
    //   }

    //   // If the line is fully within the fold we exclude it
    //   if (lineStartInFold && lineEndInFold) {
    //     continue;
    //   }

    //   // If we have a fold ending part way through the line
    //   // we append the remaining tokens to the previous line
    //   let appendingToPreviousLine = false;
    //   if (lineStartInFold && !lineEndInFold) {
    //     lineFrom = foldTo;
    //     appendingToPreviousLine = true;
    //   }

    //   // If our line starts in a fold, we update data to the previous stored line
    //   // const lineStartInFold = line.from >= foldFrom && line.from < foldTo;
    //   if (lineStartInFold) {
    //     // console.log(_number, line.from, line.to, foldFrom, foldTo);
    //     // Append to previous data
    //     let last = lineRanges.pop();
    //     if (last) {
    //       line.from = last.from;
    //       line.text = last.text + line.text;
    //       folded = last.folded;
    //     }

    //     // If we haven't already appended this fold
    //     if (folded.length === 0 || folded.slice(-1)[0].to !== foldTo) {
    //       folded.push({ from: foldFrom, to: foldTo });
    //     }
    //   }

    //   lineRanges.push({ ...line, folded });
    // }

    // console.log("New line ranges", lineRangesNew);

    // Reset this, we should consolidate this to not do it twice
    // Resetting it fixes the bug where we're not rendering collapsed ranges
    // foldedRangeCursor = foldedRanges(state).iter();

    // const tagsData = tags({ state, lines: lineRanges }, update);
    // const diagnosticData = diagnostics({ state, ranges: lineRanges });
    // const selectionData = selections({ update, lines: lineRanges });

    this.text.update({ update, lines: lineRangesNew });
    this.selection.update({ update, lines: lineRangesNew });
    this.diagnostic.update({ update, lines: lineRangesNew });

    return lineRangesNew;

    // console.log("Selection Data", selectionData);
    //
    for (let i = 1; i <= doc.lines; i++) {
      let { from: lineFrom, to: lineTo, text: lineText } = doc.line(i);

      /* START FOLDED RANGES */
      // Iterate through folded ranges until we're at or past the current line
      while (foldedRangeCursor.value && foldedRangeCursor.to < lineFrom) {
        foldedRangeCursor.next();
      }

      const { from: foldFrom, to: foldTo } = foldedRangeCursor;
      const lineStartInFold = lineFrom >= foldFrom && lineFrom < foldTo;
      const lineEndInFold = lineTo > foldFrom && lineTo <= foldTo;

      // If we have a fold beginning part way through the line
      // we drop the folded tokens
      if (!lineStartInFold && lineEndInFold) {
        lineTo = foldFrom;
      }

      // If the line is fully within the fold we exclude it
      if (lineStartInFold && lineEndInFold) {
        continue;
      }

      // If we have a fold ending part way through the line
      // we append the remaining tokens to the previous line
      let appendingToPreviousLine = false;
      if (lineStartInFold && !lineEndInFold) {
        lineFrom = foldTo;
        appendingToPreviousLine = true;
      }
      /* END FOLDED RANGES */

      // /* START SELECTIONS */
      // const selectionsInLine: Array<LineSelection> = [];
      // do {
      //   if (!state.selection.ranges[selectionIndex]) {
      //     break;
      //   }
      //   const { from: sFrom, to: sTo } = state.selection.ranges[selectionIndex];

      //   const startsInLine = lineFrom <= sFrom && lineTo >= sFrom;
      //   const endsInLine = lineFrom <= sTo && lineTo >= sTo;
      //   const crossesLine = lineFrom > sFrom && lineTo < sTo;

      //   if (startsInLine || endsInLine || crossesLine) {
      //     // Only add if selection length is greater than 0
      //     if (sFrom != sTo) {
      //       selectionsInLine.push({
      //         from: Math.max(sFrom - lineFrom, 0),
      //         to: Math.min(sTo - lineFrom, lineTo - lineFrom),
      //         continues: !endsInLine,
      //       });

      //       if (!endsInLine) {
      //         break;
      //       }
      //     }
      //   } else {
      //     break;
      //   }

      //   selectionIndex += 1;
      // } while (selectionIndex < state.selection.ranges.length);
      // /* END SELECTIONS */

      /* START DIAGNOSTICS */

      /* END DIAGNOSTICS */

      if (lineText === "") {
        lines.push({
          text: [{ text: "" }],
          // selections: selectionData.get(i),
          // diagnostic: diagnosticData.get(i),
        });
        continue;
      }

      const spans: Array<LineText> = [];

      // let pos = lineFrom;
      // highlightTree(
      //   tree,
      //   highlighter,
      //   (from, to, tags) => {
      //     if (from > pos) {
      //       spans.push({ text: doc.sliceString(pos, from) });
      //     }

      //     spans.push({ text: doc.sliceString(from, to), tags });

      //     pos = to;
      //   },
      //   lineFrom,
      //   lineTo
      // );

      // if (pos < lineTo) {
      //   spans.push({ text: doc.sliceString(pos, lineTo) });
      // }

      // if (appendingToPreviousLine) {
      //   const prevLine = lines[lines.length - 1];

      //   // Add spacer, trailing line text to previous line
      //   const spacer = { text: "…" };
      //   prevLine.text = prevLine.text.concat([spacer, ...spans]);

      //   // Update previous selections
      //   if (prevLine.selections.length > 0) {
      //     // If our last selection continued, add a selection for the spacer
      //     if (prevLine.selections[prevLine.selections.length - 1].continues) {
      //       prevLine.selections[prevLine.selections.length - 1].to += 1;
      //     }

      //     // Selections in this line can no longer continue, as we're appending to it
      //     prevLine.selections = prevLine.selections.map((s) => ({
      //       ...s,
      //       continues: false,
      //     }));
      //   }

      //   // Adjust trailing line selection positions
      //   const spansLength = spans.reduce((p, c) => p + c.text.length, 0);
      //   const prevLength = prevLine.text.reduce((v, c) => v + c.text.length, 0);
      //   let adjustedSelections = selectionsInLine.map((s) => ({
      //     ...s,
      //     from: s.from + prevLength - spansLength,
      //     to: s.to + prevLength - spansLength,
      //   }));

      //   if (prevLine.selections.length > 0 && adjustedSelections.length > 0) {
      //     const last = prevLine.selections.slice(-1)[0];
      //     const firstAdditional = adjustedSelections.slice(-1)[0];
      //     // Combine consecutive selections if possible
      //     if (last.to === firstAdditional.from) {
      //       prevLine.selections[prevLine.selections.length - 1] = {
      //         from: last.from,
      //         to: firstAdditional.to,
      //         continues: firstAdditional.continues,
      //       };

      //       // Remove that selection
      //       adjustedSelections = adjustedSelections.slice(1);
      //     }
      //   }

      //   // Add remaining trailing line selections to previous line
      //   prevLine.selections = prevLine.selections.concat(adjustedSelections);

      //   continue;
      // }

      // Otherwise, just append the line as normal
      lines.push({
        text: spans,
        // selections: selectionData.get(i),
        // diagnostic: diagnosticData.get(i),
      });
    }

    return lines;
  }

  public render() {
    const lines = this.lines;

    const containerX = this._view.contentDOM.clientWidth;
    updateBoxShadow(this._view);

    if (containerX <= SCALE * CANVAS_MAX_WIDTH) {
      const ratio = containerX / (SCALE * CANVAS_MAX_WIDTH);

      this._canvas.width = CANVAS_MAX_WIDTH * ratio * 2;
    } else {
      this._canvas.width = CANVAS_MAX_WIDTH * 2;
    }

    // this._canvas.height = this._container.clientHeight * 2;
    // this._canvas.style.height = this._container.clientHeight + "px";
    this._canvas.height = 1000;
    this._canvas.style.height = "500px";

    const context = this._canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, this._canvas.width, this._canvas.height);

    context.scale(1 / SCALE, 1 / SCALE);

    const { top: paddingTop } = this._view.documentPadding;
    let offsetY = paddingTop;

    let lineHeight = 13; /* HACKING THIS IN */ /* We should be incrementing this within the drawer, I guess? */ /* Or just computing it globally */

    const maxLinesForCanvas = Math.round(
      context.canvas.height / (lineHeight / SCALE)
    );

    const middleOfViewport =
      this._view.scrollDOM.scrollTop + this._view.scrollDOM.clientHeight / 2;

    // console.log(this._view.scrollDOM.scrollTop * )
    // const ratio = middleOfViewport / this._view.scrollDOM.scrollHeight;

    // console.log(
    //   this._view.scrollDOM.scrollTop,
    //   this._view.scrollDOM.scrollHeight,
    //   this._view.scrollDOM.clientHeight,
    //   this._view.dom.scrollHeight,
    //   this._view.dom.scrollTop,
    //   this._view.dom.clientHeight
    // );

    // At scrolltop = 0; startline should = 0;
    // At scrolltop scrollHeight - clientH; startline should = lines - max lines in viewport

    // const ratio = middleOfViewport / this._view.scrollDOM.scrollHeight;
    // const startLine = lines.length * ratio - maxLinesForCanvas * ratio;
    // console.log("Range", startLine, startLine + maxLinesForCanvas);

    // THIS IS WORKING FOR OVERSCROLLING HEIGHT!!! :)
    const scroller = this._view.scrollDOM;
    const ratio =
      scroller.scrollTop *
      (1 / (scroller.scrollHeight - scroller.clientHeight));

    const startLine =
      (lines.length - maxLinesForCanvas) * (isNaN(ratio) ? 0 : ratio);

    // Using Math.max keeps us at 0 if the document doesn't overflow the height
    let startIndex = Math.max(0, Math.round(startLine));

    for (let i = startIndex; i < startIndex + maxLinesForCanvas; i++) {
      // for (const [index, line] of lines.entries()) {
      const drawContext = {
        context,
        offsetY,
        lineHeight,
        charWidth: context.measureText("_").width,
      };
      this.text.drawLine(drawContext, i + 1);

      // TODO: temporarily commenting out bc distracting
      // this.selection.drawLine(drawContext, i + 1);
      // this.diagnostic.drawLine(drawContext, i + 1);

      offsetY += lineHeight;
    }

    // for (let i = 0; i < lines.length; i++) {
    //   const line = lines[i];
    //   let x = 0;

    //   // const lineText = line.text.map((t) => t.text).join("");

    //   let lineHeight = 0;
    //   lineHeight = 12;
    //   for (let j = 0; j < line.to - line.from; j++) {
    //   context.textBaseline = "ideographic";
    // const info = this.getFontInfo(line.text[j]);
    //   context.fillStyle = info.color;
    // context.font = info.font;
    // lineHeight = Math.max(lineHeight, info.fontSize);
    // lineHeight = 12;
    //   if (this._displayText === "characters") {
    //     // TODO: `fillText` takes up the majority of profiling time in `render`
    //     // Try speeding it up with `drawImage`
    //     // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081
    //     context.fillText(line.text[j].text, x, offsetY + lineHeight);
    //     x += context.measureText(line.text[j].text).width;
    //   }
    //   if (this._displayText === "blocks") {
    //     const characters = line.text[j].text;
    //     /* Each block's width is 3/4 of its height */
    //     // const widthMultiplier = 0.75;
    //     const charWidth = context.measureText("_").width;
    //     const nonWhitespaceRegex = /\S+/g;
    //     // const whitespaceRanges: [number, number][] = [];
    //     let match: RegExpExecArray | null;
    //     while ((match = nonWhitespaceRegex.exec(characters)) !== null) {
    //       const start = match.index;
    //       const end = nonWhitespaceRegex.lastIndex;
    //       context.globalAlpha = 0.65; // Make the blocks a bit faded
    //       context.beginPath();
    //       context.rect(
    //         x + start * charWidth,
    //         offsetY,
    //         (end - start) * charWidth,
    //         lineHeight - 2 /* 2px buffer between lines */
    //       );
    //       context.fill();
    //     }
    //     x += characters.length * charWidth;
    //   }
    // }

    // if (line.selections) {
    //   // console.log(line.selections);

    //   for (let j = 0; j < line.selections.length; j++) {
    //     const selection = line.selections[j];
    //     // console.log("A selection", selection);
    //     const prefix = context.measureText(lineText.slice(0, selection.from));
    //     const text = context.measureText(
    //       lineText.slice(selection.from, selection.to)
    //     );

    //     context.beginPath();
    //     context.rect(
    //       prefix.width,
    //       heightOffset,
    //       selection.extends
    //         ? this._canvas.width * SCALE - prefix.width
    //         : text.width,
    //       lineHeight
    //     );
    //     context.fillStyle = this.getSelectionInfo().backgroundColor;

    //     context.fill();
    //   }
    // }
    /* Each block's width is 3/4 of its height */
    // const widthMultiplier = 0.75;

    // if (line.diagnostic) {
    //   context.globalAlpha = 0.65;
    //   context.fillStyle =
    //     line.diagnostic === "error"
    //       ? "red"
    //       : line.diagnostic === "warning"
    //       ? "yellow"
    //       : "blue"; // TODO: Does this need to be customized?
    //   context.beginPath();
    //   context.rect(
    //     0,
    //     heightOffset,
    //     this._canvas.width * SCALE,
    //     lineHeight /* - 2 */ /* Do we want 2px buffer between lines? */
    //   );
    //   context.fill();
    // }

    // offsetY += lineHeight;
    // }

    context.restore();
  }

  public destroy() {
    this._gutter.remove();
    this._container.remove();
  }

  private getFontInfo(token: LineText): FontInfo {
    const tags = token.tags ?? "";
    const cached = this._fontInfoMap.get(tags);
    if (cached) {
      return cached;
    }

    // Create a mock token
    const mockToken = document.createElement("span");
    mockToken.setAttribute("class", tags);
    this._view.contentDOM.appendChild(mockToken);

    // Get style information and store it
    const style = window.getComputedStyle(mockToken);
    const fontSize = Math.floor(
      parseFloat(style.fontSize) / /* MINIMAP_SCALE*/ 1
    );
    const result = {
      color: style.color,
      font: `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
      fontSize,
    };
    this._fontInfoMap.set(tags, result);

    // Clean up and return
    this._view.contentDOM.removeChild(mockToken);
    return result;
  }

  /**
   * Clears the font info storage. Useful when themes change and we need to
   * recompute font info for new theme classes
   */
  private clearFontInfo(): void {
    this._fontInfoMap.clear();
  }

  // private getSelectionInfo(): SelectionInfo {
  //   let result: SelectionInfo;
  //   if (this._selectionInfo) {
  //     result = this._selectionInfo;
  //   } else {
  //     result = { backgroundColor: "rgba(0, 0, 0, 0)" };
  //   }
  //   // Query for existing selection
  //   const selection = this._view.dom.querySelector(".cm-selectionBackground");

  //   // // If null, temporarily return transparent. After one paint, we'll get the color
  //   // if (!selection) {
  //   //   return { backgroundColor: "rgba(0, 0, 0, 0)" };
  //   // }

  //   // Get style information
  //   if (selection) {
  //     const style = window.getComputedStyle(selection);
  //     result = { backgroundColor: style.backgroundColor };
  //   }

  //   this._selectionInfo = result;

  //   return result;
  // }
}

export const minimapView = ViewPlugin.fromClass(
  class {
    minimap: Minimap;
    config: Config;

    constructor(readonly view: EditorView) {
      this.minimap = new Minimap(view);
      this.config = view.state.facet(minimapConfig);

      view.scrollDOM.addEventListener("scroll", () => {
        this.minimap.render();
      });
    }

    update(update: ViewUpdate) {
      const config = update.state.facet(minimapConfig);
      const previousConfig = update.startState.facet(minimapConfig);
      const configChanged = previousConfig !== config;

      let updatedDiagnostics = false;
      for (const tr of update.transactions) {
        for (const ef of tr.effects) {
          if (ef.is(setDiagnosticsEffect)) {
            updatedDiagnostics = true;
          }
        }
      }

      // if (
      //   updatedDiagnostics ||
      //   configChanged ||
      //   update.heightChanged ||
      //   update.docChanged ||
      //   update.selectionSet ||
      //   update.geometryChanged
      // ) {
      // TODO: We can decouple the rendering from the line building by caching the line data
      // We already cache individual renderer data, we just need to cache the line ranges in a facet
      const lines = this.minimap.buildLines(update);
      this.minimap.lines = this.minimap.buildLines(update);
      this.minimap.render();
      // }
    }

    destroy() {
      this.minimap.destroy();
    }
  },
  {
    eventHandlers: {
      scroll: (event, view) => {
        updateBoxShadow(view);
      },
    },
    provide: () => [overlay()],
  }
);

function updateBoxShadow(view: EditorView) {
  const minimap = view.plugin(minimapView)?.minimap;
  if (!minimap) {
    return;
  }

  // Hacking in box shadow stuff, this needs to re-render when other things do not...
  // Also, had to make a couple things public here, so likely not the right place.
  // Could be a method w/i minimap
  const containerX = view.scrollDOM.clientWidth;
  const contentX = view.scrollDOM.scrollWidth;
  const scrollLeft = view.scrollDOM.scrollLeft;

  if (containerX + scrollLeft < contentX) {
    // minimap._canvas.style.boxShadow = "12px 0px 20px 5px #6c6c6c";
  } else {
    minimap._canvas.style.boxShadow = "inherit";
  }
  // End box shadow stuff
}

export function minimap(config: Config = {}): Extension {
  return [minimapTheme, minimapConfig.of(config), minimapView];
}
