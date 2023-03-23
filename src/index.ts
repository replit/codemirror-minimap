import { EditorView } from "@codemirror/view";
import { EditorState, Text } from "@codemirror/state";
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
      basicSetup,
      javascript(),
      paintToCanvasExtension,
      scrollExtension,
    ],
  }),
  parent: editor,
});

const MINIMAP_WIDTH = 180;
const MINIMAP_SCALE = 3; /* Could make this configurable somehow later...*/

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

const fontInfoMap: Map<string, { color: string }> = new Map();

type HighlightedLine = Array<{ text: string; tags?: string }>;

function renderAsCanvas(state: EditorState) {
  const parser = javascript().language.parser;

  const text = Text.of(view.state.doc.toString().split("\n"));
  const tree = parser.parse(text.toString());

  const lines: Array<HighlightedLine> = [];

  const foldedRangesCursor = foldedRanges(state).iter();

  const highlighter: Highlighter = {
    style: (tags) => highlightingFor(view.state, tags),
  };
  console.log(highlighter.style);

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    let pos = line.from;

    while (foldedRangesCursor.value && foldedRangesCursor.to < line.from) {
      foldedRangesCursor.next();
    }

    const { from, to } = foldedRangesCursor;
    if (
      (line.from >= from && line.from < to) ||
      (line.to > from && line.to <= to)
    ) {
      if (line.to > to) {
        lines[lines.length - 1] = lines[lines.length - 1]
          .concat([{ /* Represents the fold placeholder */ text: " " }])
          .concat(
            /* TODO FIXME to include real spans */ [
              { text: line.text.slice(to - line.from) },
            ]
          );
      }

      continue;
    }

    if (line.text === "") {
      lines.push([{ text: "" }]);
      continue;
    }

    const spans: HighlightedLine = [];

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
      line.from,
      line.to
    );

    if (pos < line.to) {
      spans.push({ text: text.sliceString(pos, line.to) });
    }

    lines.push(spans);
  }

  const ctx = canvas.getContext("2d");

  if (ctx) {
    const fontFamily = "monospace";
    const fontSize = 12;
    const lineHeight = fontSize * 1.4;
    ctx.font = `${fontSize}px ${fontFamily}`;

    /* TODO height+scale is challenging. Right now this clips overflow... */
    canvas.style.height = "100%";
    canvas.height = canvas.offsetHeight;

    ctx.scale(1 / MINIMAP_SCALE, 1 / MINIMAP_SCALE);

    // canvas.height = lines.length * lineHeight;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x = 0;

      const y = (i + 1) * lineHeight; /* line height */

      for (let j = 0; j < line.length; j++) {
        ctx.textBaseline = "ideographic";
        ctx.fillStyle = getFontInfo(line[j]).color;
        ctx.fillText(line[j].text, x, y);
        x += ctx.measureText(line[j].text).width;
      }
    }

    ctx.restore();
  }
}

function getFontInfo(token: HighlightedLine[number]): { color: string } {
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
  const result = { color: style.color };
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
      selection: { anchor: docPos, head: docPos },
    });
  }

  // console.log(editorRect.height, editorRect.width);
}

canvas.addEventListener("click", function (e) {
  getCursorPosition(canvas, e);
});
