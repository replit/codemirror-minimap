import { EditorView, drawSelection } from "@codemirror/view";
import { EditorState, Text, SelectionRange } from "@codemirror/state";
import {
  syntaxTree,
  highlightingFor,
  foldedRanges,
} from "@codemirror/language";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { highlightTree, getStyleTags, Highlighter } from "@lezer/highlight";
import { LRParser } from "@lezer/lr";

const defaultCode = `
  function factorial(n) {
    if (n === 0 || n === 1) {
      return 1;
    } else {
      return n * factorial(n - 1);
    }
  } /* Hello world */

  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;

  function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
  const min = 1; // minimum value for random number
  const max = 100; // maximum value for random number
  for (let i = 0; i < 10; i++) { // loop 10 times
    const randomNumber = getRandomNumber(min, max); // get a random number between min and max
    console.log("Random Number " + String(i+1): + String(randomNumber)); // output the random number to the console
  }
  console.log("Done!"); // output "Done!" to the console when finished
  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */
  console.log('The sum of factorials is: ', sumOfFactorials);
  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;



  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);


  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);

  const NUM_TRIALS = 100;
  const MAX_NUMBER = 100;

  let sumOfFactorials = 0;
  for (let i = 0; i < NUM_TRIALS; i++) {
    const randomInt = Math.floor(Math.random() * MAX_NUMBER) + 1;
    sumOfFactorials += factorial(randomInt);
  } /* Hello world */

  console.log('The sum of factorials is: ', sumOfFactorials);
`;

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

const view = new EditorView({
  state: EditorState.create({
    doc: defaultCode,
    extensions: [
      /* For demo */
      basicSetup,
      javascript(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),

      /* Minimap extensions */
      paintToCanvasExtension,
      scrollExtension,
    ],
  }),
  parent: editor,
});

const MINIMAP_WIDTH = 300;
const MINIMAP_SCALE = 2; /* Could make this configurable somehow later...*/

// Create and append minimap
const wrapper = document.createElement("div");
const canvas = document.createElement("canvas");
const overlayCanvas = document.createElement("canvas");

wrapper.appendChild(canvas);
wrapper.appendChild(overlayCanvas);

editor.appendChild(wrapper);
editor.classList.add("with-minimap");

wrapper.style.position = "relative";
wrapper.style.overflow = "hidden";
wrapper.style.minWidth = MINIMAP_WIDTH + "px";
wrapper.style.width = MINIMAP_WIDTH + "px";
wrapper.style.boxShadow = "12px 0px 20px 5px #6c6c6c";

overlayCanvas.style.opacity = "0.1";
overlayCanvas.style.backgroundColor = "black";
overlayCanvas.style.position = "absolute";
overlayCanvas.style.width = MINIMAP_WIDTH + "px";
overlayCanvas.style.height = getOverlayHeight(view);
overlayCanvas.style.top = getOverlayTop(view);

const fontInfoMap: Map<string, { color: string; font: string }> = new Map();

type LineText = Array<{ text: string; tags?: string }>;
type Selection = Array<{ from: number; to: number; continues?: boolean }>;

function renderAsCanvas(state: EditorState) {
  const parser = javascript().language.parser;

  const isScrollingHorizontally =
    view.scrollDOM.clientWidth <= view.scrollDOM.scrollWidth;
  // console.log(isScrollingHorizontally);

  if (isScrollingHorizontally) {
    const percentScrolled =
      view.scrollDOM.clientWidth / view.scrollDOM.scrollWidth;

    const newMinimapWidth = MINIMAP_WIDTH * percentScrolled;

    // Avoid minor flapping by only updating when difference is > 2px from what it should be?
    if (Math.abs(newMinimapWidth - wrapper.clientWidth) > 2) {
      wrapper.style.minWidth = MINIMAP_WIDTH * percentScrolled + "px";
      wrapper.style.width = MINIMAP_WIDTH * percentScrolled + "px";
    }

    // console.log(percentScrolled);
  }

  const value = editor.clientWidth - view.scrollDOM.clientWidth;
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

  const text = Text.of(view.state.doc.toString().split("\n"));
  const tree = parser.parse(text.toString());

  const lines: Array<{ text: LineText; selections: Selection }> = [];

  const foldedRangesCursor = foldedRanges(state).iter();

  const highlighter: Highlighter = {
    style: (tags) => highlightingFor(view.state, tags),
  };

  const selections = state.selection.ranges;
  let selectionIndex = 0;

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    let pos = line.from;

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
      const current = selections[selectionIndex];
      if (!current) {
        break;
      }

      const startsInLine = lineFrom <= current.from && lineTo >= current.from;
      const endsInLine = lineFrom <= current.to && lineTo >= current.to;
      const crossesLine = lineFrom > current.from && lineTo < current.to;

      if (startsInLine || endsInLine || crossesLine) {
        console.log(
          lineFrom,
          lineTo,
          current,
          startsInLine,
          endsInLine,
          crossesLine
        );
        // Only add if selection length is greater than 0
        if (current.from != current.to) {
          selectionsInLine.push({
            from: Math.max(current.from - lineFrom, 0),
            to: Math.min(current.to - lineFrom, lineTo - lineFrom),
            continues: !endsInLine,
          });
        }
      } else {
        break;
      }

      selectionIndex += 1;
    } while (selectionIndex < selections.length);
    if (selectionsInLine[selectionsInLine.length - 1]?.continues) {
      selectionIndex -= 1;
    }

    if (line.text === "") {
      lines.push({ text: [{ text: "" }], selections: selectionsInLine });
      continue;
    }

    const spans: LineText = [];

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
      lines[lines.length - 1].text = lines[lines.length - 1].text.concat(spans);
    } else {
      lines.push({ text: spans, selections: selectionsInLine });
    }
  }

  const ctx = canvas.getContext("2d");

  if (ctx) {
    // const fontFamily = "monospace";
    const fontSize = 12;
    const lineHeight = fontSize * 1.4;
    // ctx.font = `${fontSize}px ${fontFamily}`;

    /* TODO height+scale is challenging. Right now this clips overflow... */
    canvas.style.height = "100%";
    canvas.height = canvas.offsetHeight;

    ctx.scale(1 / MINIMAP_SCALE, 1 / MINIMAP_SCALE);

    // canvas.height = lines.length * lineHeight;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = 0;

      const y = (i + 1) * lineHeight; /* line height */

      const lineText = line.text.map((t) => t.text).join("");

      for (let j = 0; j < line.text.length; j++) {
        ctx.textBaseline = "ideographic";
        ctx.fillStyle = getFontInfo(line.text[j]).color;
        ctx.font = getFontInfo(line.text[j]).font;
        ctx.fillText(line.text[j].text, x, y);
        x += ctx.measureText(line.text[j].text).width;
      }

      for (let j = 0; j < line.selections.length; j++) {
        const s = line.selections[j];
        const offset = ctx.measureText(lineText.slice(0, s.from));
        const text = ctx.measureText(lineText.slice(s.from, s.to));

        if (s.continues) {
          ctx.beginPath();
          ctx.rect(
            offset.width,
            y - lineHeight,
            canvas.width - offset.width,
            lineHeight
          );
          ctx.fillStyle = "green";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.rect(offset.width, y - lineHeight, text.width, lineHeight);
        ctx.fillStyle = "red";
        ctx.fill();

        //         ctx.beginPath();
        //         line.selection[j].
        // ctx.rect(20, 20, 150, 100);
        // ctx.fillStyle = "red";
        // ctx.fill();
      }
    }

    ctx.restore();
  }
}

function getFontInfo(token: LineText[number]): {
  color: string;
  font: string;
} {
  const tags = token.tags;
  if (!tags) {
    // If no tags, fall back to editor color?
    return getFontInfo({ text: token.text, tags: "cm-editor" });
  }
  const cached = fontInfoMap.get(tags);
  if (cached) {
    return cached;
  }

  // Create a mock token
  const mockToken = document.createElement("span");
  mockToken.setAttribute("class", tags);
  wrapper.appendChild(mockToken);

  // Get style information and store it
  const style = window.getComputedStyle(mockToken);
  const fontSize = Math.floor(parseFloat(style.fontSize) / MINIMAP_SCALE);
  const result = {
    color: style.color,
    font: `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
  };
  fontInfoMap.set(tags, result);

  // Clean up and return
  wrapper.removeChild(mockToken);
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

  console.log(transformedX, transformedY);

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
