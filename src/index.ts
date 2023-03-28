import { EditorView, drawSelection } from "@codemirror/view";
import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
} from "@codemirror/state";
import {} from "@codemirror/commands";
import {
  syntaxTree,
  highlightingFor,
  foldedRanges,
} from "@codemirror/language";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";
import { LRParser } from "@lezer/lr";
// import { getMatches } from "@codemirror/search";

const paintToCanvasExtension = EditorView.updateListener.of((update) => {
  renderAsCanvas(update.state);
});

function getOverlayHeight(v: EditorView) {
  /* This isn't the right calculation right now, as the canvas height doesn't overflow correctly */
  /* But it works for a static 500px .... */
  return v.scrollDOM.clientHeight / MINIMAP_SCALE + "px";
}
function getOverlayTop(v: EditorView) {
  return v.scrollDOM.scrollTop / MINIMAP_SCALE + "px";
}

const scrollExtension = EditorView.domEventHandlers({
  scroll: (event, v) => {
    overlayCanvas.style.height = getOverlayHeight(v);
    overlayCanvas.style.top = getOverlayTop(v);
  },
});

const editor = document.getElementById("editor") as HTMLElement;

const MINIMAP_WIDTH = 400;
const MINIMAP_SCALE = 1; /* Could make this configurable somehow later...*/

// Create and append minimap
const wrapper = document.createElement("div");
const canvas = document.createElement("canvas");
const overlayCanvas = document.createElement("canvas");

// TEMP
overlayCanvas.style.display = "none";

wrapper.appendChild(canvas);
wrapper.appendChild(overlayCanvas);

editor.appendChild(wrapper);
editor.classList.add("with-minimap");

wrapper.style.position = "relative";
// wrapper.style.overflow = "hidden";
wrapper.style.minWidth = MINIMAP_WIDTH + "px";
wrapper.style.width = MINIMAP_WIDTH + "px";
wrapper.style.boxShadow = "12px 0px 20px 5px #6c6c6c";

overlayCanvas.style.opacity = "0.1";
overlayCanvas.style.backgroundColor = "black";
overlayCanvas.style.position = "absolute";
overlayCanvas.style.width = MINIMAP_WIDTH + "px";
overlayCanvas.style.height = getOverlayHeight(view);
overlayCanvas.style.top = getOverlayTop(view);

const fontInfoMap: Map<
  string,
  { color: string; font: string; fontSize: number }
> = new Map();

type LineText = Array<{ text: string; tags?: string }>;
type Selection = Array<{ from: number; to: number; continues: boolean }>;

function renderAsCanvas(state: EditorState) {
  const parser = javascript().language.parser;

  // const isScrollingHorizontally =
  //   view.scrollDOM.clientWidth <= view.scrollDOM.scrollWidth;
  // // console.log(isScrollingHorizontally);

  // if (isScrollingHorizontally) {
  //   const percentScrolled =
  //     view.scrollDOM.clientWidth / view.scrollDOM.scrollWidth;

  //   const newMinimapWidth = MINIMAP_WIDTH * percentScrolled;

  //   // Avoid minor flapping by only updating when difference is > 2px from what it should be?
  //   if (Math.abs(newMinimapWidth - wrapper.clientWidth) > 2) {
  //     wrapper.style.minWidth = MINIMAP_WIDTH * percentScrolled + "px";
  //     wrapper.style.width = MINIMAP_WIDTH * percentScrolled + "px";
  //   }

  //   // console.log(percentScrolled);
  // }

  // const value = editor.clientWidth - view.scrollDOM.clientWidth;
  // console.log("Minimap width", value);

  // console.log(
  //   "Ed",
  //   editor.clientWidth,
  //   editor.scrollWidth,
  //   editor.getBoundingClientRect().width
  // );

  // Given:
  // (leaving 2px for the cursor to have space after the last character)
  // viewportColumn = (contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth
  // minimapWidth = viewportColumn * minimapCharWidth
  // contentWidth = remainingWidth - minimapWidth
  // What are good values for contentWidth and minimapWidth ?

  // minimapWidth = ((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth) * minimapCharWidth
  // typicalHalfwidthCharacterWidth * minimapWidth = (contentWidth - verticalScrollbarWidth - 2) * minimapCharWidth
  // typicalHalfwidthCharacterWidth * minimapWidth = (remainingWidth - minimapWidth - verticalScrollbarWidth - 2) * minimapCharWidth
  // (typicalHalfwidthCharacterWidth + minimapCharWidth) * minimapWidth = (remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth
  // minimapWidth = ((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)

  let minimapScale = 1; /* Does this just work? */
  let pixelRatio = 1; /* Does this also just work? */
  let minimapCharWidth = minimapScale / pixelRatio;

  const remainingWidth = 0;
  // const minimapWidth = ((remainingWidth) * minimapCharWidth) / ()

  /*
    if (!query.valid) {
    return [];
  }

  const ranges = [];
  const cursor = query.getCursor(doc);

  let iter = cursor.next();
  while (!iter.done && ranges.length < limit) {
    ranges.push(iter.value);

    iter = cursor.next();
  }

  return ranges;
  */

  const text = Text.of(view.state.doc.toString().split("\n"));
  const tree = parser.parse(text.toString());

  const lines: Array<{
    text: LineText;
    selections: Selection;
  }> = [];

  const foldedRangesCursor = foldedRanges(state).iter();

  const highlighter: Highlighter = {
    style: (tags) => highlightingFor(view.state, tags),
  };

  const selections = state.selection.ranges;
  let selectionIndex = 0;

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    /* FOLDED RANGES */

    // Iterate through folded ranges until we're at or past the current line
    while (foldedRangesCursor.value && foldedRangesCursor.to < line.from) {
      foldedRangesCursor.next();
    }

    const { from: foldFrom, to: foldTo } = foldedRangesCursor;
    let { from: lineFrom, to: lineTo } = line;
    let appendingToPreviousLine = false;

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
    if (lineStartInFold && !lineEndInFold) {
      lineFrom = foldTo;
      appendingToPreviousLine = true;
    }

    /* SELECTION */
    const selectionsInLine: Selection = [];
    do {
      if (!selections[selectionIndex]) {
        break;
      }
      const { from: sFrom, to: sTo } = selections[selectionIndex];

      const startsInLine = lineFrom <= sFrom && lineTo >= sFrom;
      const endsInLine = lineFrom <= sTo && lineTo >= sTo;
      const crossesLine = lineFrom > sFrom && lineTo < sTo;

      if (startsInLine || endsInLine || crossesLine) {
        // Only add if selection length is greater than 0
        if (sFrom != sTo) {
          selectionsInLine.push({
            from: Math.max(sFrom - lineFrom, 0),
            to: Math.min(sTo - lineFrom, lineTo - lineFrom),
            continues: !endsInLine,
          });

          if (!endsInLine) {
            break;
          }
        }
      } else {
        break;
      }

      selectionIndex += 1;
    } while (selectionIndex < selections.length);

    if (line.text === "") {
      lines.push({
        text: [{ text: "" }],
        selections: selectionsInLine,
      });
      continue;
    }

    const spans: LineText = [];

    let pos = lineFrom;
    highlightTree(
      tree,
      highlighter,
      (from, to, tags) => {
        if (from > pos) {
          spans.push({ text: text.sliceString(pos, from) });
        }

        spans.push({ text: text.sliceString(from, to), tags });

        pos = to;
      },
      lineFrom,
      lineTo
    );

    if (pos < lineTo) {
      spans.push({ text: text.sliceString(pos, lineTo) });
    }

    if (appendingToPreviousLine) {
      const prevLine = lines[lines.length - 1];

      // Add spacer, trailing line text to previous line
      const spacer = { text: "…" };
      prevLine.text = prevLine.text.concat([spacer, ...spans]);

      // Update previous selections
      if (prevLine.selections.length > 0) {
        // If our last selection continued, add a selection for the spacer
        if (prevLine.selections[prevLine.selections.length - 1].continues) {
          prevLine.selections[prevLine.selections.length - 1].to += 1;
        }

        // Selections in this line can no longer continue, as we're appending to it
        prevLine.selections = prevLine.selections.map((s) => ({
          ...s,
          continues: false,
        }));
      }

      // Adjust trailing line selection positions
      const spansLength = spans.reduce((p, c) => p + c.text.length, 0);
      const prevLength = prevLine.text.reduce((v, c) => v + c.text.length, 0);
      let adjustedSelections = selectionsInLine.map((s) => ({
        ...s,
        from: s.from + prevLength - spansLength,
        to: s.to + prevLength - spansLength,
      }));

      if (prevLine.selections.length > 0 && adjustedSelections.length > 0) {
        const last = prevLine.selections.slice(-1)[0];
        const firstAdditional = adjustedSelections.slice(-1)[0];
        // Combine consecutive selections if possible
        if (last.to === firstAdditional.from) {
          prevLine.selections[prevLine.selections.length - 1] = {
            from: last.from,
            to: firstAdditional.to,
            continues: firstAdditional.continues,
          };

          // Remove that selection
          adjustedSelections = adjustedSelections.slice(1);
        }
      }

      // Add remaining trailing line selections to previous line
      prevLine.selections = prevLine.selections.concat(adjustedSelections);

      console.log(prevLine.selections);
      continue;
    }

    // Otherwise, just append the line as normal
    lines.push({ text: spans, selections: selectionsInLine });
  }

  const ctx = canvas.getContext("2d");

  if (ctx) {
    // const fontFamily = "monospace";
    // const fontSize = 12;
    const lineHeightMultiple = 1;
    // ctx.font = `${fontSize}px ${fontFamily}`;

    /* TODO height+scale is challenging. Right now this clips overflow... */
    // canvas.style.height = "100%";
    // canvas.height = canvas.offsetHeight;

    ctx.scale(1 / MINIMAP_SCALE, 1 / MINIMAP_SCALE);
    // canvas.height = lineHeight * lines.length;
    // canvas.height = lines.length * lineHeight;
    let heightOffset = 0;
    // canvas.height +=

    canvas.height = 2500;
    // ctx.scale(1 / 2, 1 / 2);
    // Each time canvas height is set, canvas contents are cleared

    console.log("Painting..");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = 0;

      // const y = (i + 1) * lineHeightMultiple; /* line height */

      const lineText = line.text.map((t) => t.text).join("");

      let lineHeight = 0;

      for (let j = 0; j < line.text.length; j++) {
        ctx.textBaseline = "ideographic";
        const info = getFontInfo(line.text[j]);
        // console.log(info);
        ctx.fillStyle = info.color;
        ctx.font = info.font;
        // console.log(ctx.font);

        lineHeight = Math.max(lineHeight, info.fontSize);

        ctx.fillText(line.text[j].text, x, heightOffset + lineHeight);

        x += ctx.measureText(line.text[j].text).width;
      }

      for (let j = 0; j < line.selections.length; j++) {
        const selection = line.selections[j];
        const prefix = ctx.measureText(lineText.slice(0, selection.from));
        const text = ctx.measureText(
          lineText.slice(selection.from, selection.to)
        );

        // console.log("Painting at ", heightOffset, " height", lineHeight);
        ctx.beginPath();
        ctx.rect(
          prefix.width,
          heightOffset,
          selection.continues ? canvas.width - prefix.width : text.width,
          lineHeight
        );
        ctx.fillStyle = getSelectionInfo().backgroundColor;
        console.log(getSelectionInfo().backgroundColor);
        ctx.fill();
      }

      // canvas.height += lineHeight;
      heightOffset += lineHeight;

      // canvas.height += Math.round(lineHeightMultiple * )
    }

    console.log(canvas.height);

    // canvas.height = totalLineHeight;
    ctx.restore();
  }
}

function getFontInfo(token: LineText[number]): {
  color: string;
  font: string;
  fontSize: number;
} {
  const tags = token.tags ?? "";
  const cached = fontInfoMap.get(tags);
  if (cached) {
    return cached;
  }

  // Create a mock token
  const mockToken = document.createElement("span");
  mockToken.setAttribute("class", tags);
  view.contentDOM.appendChild(mockToken);

  // Get style information and store it
  const style = window.getComputedStyle(mockToken);
  const fontSize = Math.floor(parseFloat(style.fontSize) / MINIMAP_SCALE);
  const result = {
    color: style.color,
    font: `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
    fontSize,
  };
  fontInfoMap.set(tags, result);

  // Clean up and return
  view.contentDOM.removeChild(mockToken);
  return result;
}

let storedSelectionInfo: { backgroundColor: string } | undefined;
function getSelectionInfo(): { backgroundColor: string } {
  let result;
  if (storedSelectionInfo) {
    result = storedSelectionInfo;
  } else {
    result = { backgroundColor: "rgba(0, 0, 0, 0)" };
  }
  // Query for existing selection
  const selection = editor.querySelector(".cm-selectionBackground");

  // // If null, temporarily return transparent. After one paint, we'll get the color
  // if (!selection) {
  //   return { backgroundColor: "rgba(0, 0, 0, 0)" };
  // }

  // Get style information
  if (selection) {
    const style = window.getComputedStyle(selection);
    result = { backgroundColor: style.backgroundColor };
  }

  storedSelectionInfo = result;

  return result;
}

function getSearchInfo(): { backgroundColor: string } {
  // Query for existing search
  const search = editor.querySelector(".cm-searchMatch");

  // If null, temporarily return transparent. After one paint, we'll get the color
  if (!search) {
    return { backgroundColor: "rgba(0, 0, 0, 0)" };
  }

  // Get style information
  const style = window.getComputedStyle(search);
  const result = { backgroundColor: style.backgroundColor };

  return result;
}

/* TODO
- Current line
- Search results
- (Maybe) word matches?
- Diagnostics - errors
*/

function getCursorPosition(c, event) {
  const editorRect = editor.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const canvasXScale = canvasRect.width / editorRect.width;
  const canvasYScale = canvasRect.height / editorRect.height;

  // console.log(canvasXScale, canvasYScale);

  const clickX = event.clientX - canvasRect.left;
  const clickY = event.clientY - canvasRect.top;

  const scaledX = clickX / canvasXScale;
  const scaledY = clickY / canvasYScale;

  const transformedX = editorRect.left + scaledX;
  const transformedY = editorRect.top + scaledY;

  // console.log(transformedX, transformedY);

  const docPos = view.posAtCoords({ x: transformedX, y: transformedY });
  if (docPos) {
    // const selection = view.state.wordAt(docPos);
    // console.log('selection', docPos, selection);
    // if (!selection) {
    //   return;
    // }

    view.focus();
    view.dispatch({
      effects: EditorView.scrollIntoView(docPos, {
        x: "center",
        y: "center",
      }),
      selection: { anchor: docPos, head: docPos },
    });
  }

  // console.log(editorRect.height, editorRect.width);
}

canvas.addEventListener("click", function (e) {
  getCursorPosition(canvas, e);
});
