import { LineBasedState } from "./linebasedstate";
import { Highlighter, highlightTree } from "@lezer/highlight";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { highlightingFor, language } from "@codemirror/language";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { DrawContext } from "./types";
import { Config, Options, Scale } from "./Config";
import { LinesState, foldsChanged } from "./LinesState";
import crelt from "crelt";
import { ChangeSet, EditorState, EditorSelection } from "@codemirror/state";

type TagSpan = { text: string; tags: string };
type FontInfo = { color: string; font: string; lineHeight: number };
type Line = { line: Array<TagSpan>; offset: number; prevImageData: ImageData | null; }

export class TextState extends LineBasedState<Line> {
  private _previousTree: Tree | undefined;
  private _displayText: Required<Options>["displayText"] | undefined;
  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _themeClasses: Set<string> | undefined;
  private _highlightingCallbackId: number | undefined;

  public constructor(view: EditorView) {
    super(view);

    this._themeClasses = new Set(view.dom.classList.values());
    this.updateImpl(view.state);
  }

  private shouldUpdate(update: ViewUpdate) {
    // If the doc changed
    if (update.docChanged) {
      return true;
    }

    // If configuration settings changed
    if (update.state.facet(Config) !== update.startState.facet(Config)) {
      return true;
    }

    // If the theme changed
    if (this.themeChanged()) {
      return true;
    }

    // If the folds changed
    if (foldsChanged(update.transactions)) {
      return true;
    }

    return false;
  }

  public update(update: ViewUpdate) {
    if (!this.shouldUpdate(update)) {
      return;
    }

    if (this._highlightingCallbackId) {
      typeof window.requestIdleCallback !== "undefined"
        ? cancelIdleCallback(this._highlightingCallbackId)
        : clearTimeout(this._highlightingCallbackId);
    }

    this.updateImpl(update.state, update.changes);
  }

  private updateImpl(state: EditorState, changes?: ChangeSet) {
    this.map.clear();

    /* Store display text setting for rendering */
    this._displayText = state.facet(Config).displayText;

    /* If class list has changed, clear and recalculate the font info map */
    if (this.themeChanged()) {
      this._fontInfoMap.clear();
    }

    /* Incrementally parse the tree based on previous tree + changes */
    let treeFragments: ReadonlyArray<TreeFragment> | undefined = undefined;
    if (this._previousTree && changes) {
      const previousFragments = TreeFragment.addTree(this._previousTree);

      const changedRanges: Array<ChangedRange> = [];
      changes.iterChangedRanges((fromA, toA, fromB, toB) =>
        changedRanges.push({ fromA, toA, fromB, toB })
      );

      treeFragments = TreeFragment.applyChanges(
        previousFragments,
        changedRanges
      );
    }

    /* Parse the document into a lezer tree */
    const docToString = state.doc.toString();
    const parser = state.facet(language)?.parser;
    const tree = parser ? parser.parse(docToString, treeFragments) : undefined;
    this._previousTree = tree;

    /* Highlight the document, and store the text and tags for each line */
    const highlighter: Highlighter = {
      style: (tags) => highlightingFor(state, tags),
    };

    let highlights: Array<{ from: number; to: number; tags: string }> = [];

    if (tree) {
      /**
       * The viewport renders a few extra lines above and below the editor view. To approximate
       * the lines visible in the minimap, we multiply the lines in the viewport by the scale multipliers.
       *
       * Based on the current scroll position, the minimap may show a larger portion of lines above or
       * below the lines currently in the editor view. On a long document, when the scroll position is
       * near the top of the document, the minimap will show a small number of lines above the lines
       * in the editor view, and a large number of lines below the lines in the editor view.
       *
       * To approximate this ratio, we can use the viewport scroll percentage
       *
       * ┌─────────────────────┐
       * │                     │
       * │   Extra viewport    │
       * │   buffer            │
       * ├─────────────────────┼───────┐
       * │                     │Minimap│
       * │                     │Gutter │
       * │                     ├───────┤
       * │    Editor View      │Scaled │
       * │                     │View   │
       * │                     │Overlay│
       * │                     ├───────┤
       * │                     │       │
       * │                     │       │
       * ├─────────────────────┼───────┘
       * │                     │
       * │    Extra viewport   │
       * │    buffer           │
       * └─────────────────────┘
       *
       **/

      const vpLineTop = state.doc.lineAt(this.view.viewport.from).number;
      const vpLineBottom = state.doc.lineAt(this.view.viewport.to).number;
      const vpLineCount = vpLineBottom - vpLineTop;
      const vpScroll = vpLineTop / (state.doc.lines - vpLineCount);

      const { SizeRatio, PixelMultiplier } = Scale;
      const mmLineCount = vpLineCount * SizeRatio * PixelMultiplier;
      const mmLineRatio = vpScroll * mmLineCount;

      const mmLineTop = Math.max(1, Math.floor(vpLineTop - mmLineRatio));
      const mmLineBottom = Math.min(
        vpLineBottom + Math.floor(mmLineCount - mmLineRatio),
        state.doc.lines
      );

      // Highlight the in-view lines synchronously
      highlightTree(
        tree,
        highlighter,
        (from, to, tags) => {
          highlights.push({ from, to, tags });
        },
        state.doc.line(mmLineTop).from,
        state.doc.line(mmLineBottom).to
      );
    }

    // Update the map
    this.updateMapImpl(state, highlights);

    // Highlight the entire tree in an idle callback
    highlights = [];
    const highlightingCallback = () => {
      if (tree) {
        highlightTree(tree, highlighter, (from, to, tags) => {
          highlights.push({ from, to, tags });
        });
        this.updateMapImpl(state, highlights);
        this._highlightingCallbackId = undefined;
      }
    };
    this._highlightingCallbackId =
      typeof window.requestIdleCallback !== "undefined"
        ? requestIdleCallback(highlightingCallback)
        : setTimeout(highlightingCallback);
  }

  private updateMapImpl(
    state: EditorState,
    highlights: Array<{ from: number; to: number; tags: string }>
  ) {
    this.map.clear();

    const docToString = state.doc.toString();
    const highlightsIterator = highlights.values();
    let highlightPtr = highlightsIterator.next();
    let lineStartOffset = 0;

    for (const [index, line] of state.field(LinesState).entries()) {
      const spans: Array<TagSpan> = [];

      if (line.length > 0) {
        lineStartOffset = line[0].from;
      }

      for (const span of line) {
        // Skip if it's a 0-length span
        if (span.from === span.to) {
          continue;
        }

        // Append a placeholder for a folded span
        if (span.folded) {
          spans.push({ text: "…", tags: "" });
          continue;
        }

        let position = span.from;
        while (!highlightPtr.done && highlightPtr.value.from < span.to) {
          const { from, to, tags } = highlightPtr.value;

          // Iterate until our highlight is over the current span
          if (to < position) {
            highlightPtr = highlightsIterator.next();
            continue;
          }

          // Append unstyled text before the highlight begins
          if (from > position) {
            spans.push({ text: docToString.slice(position, from), tags: "" });
          }

          // A highlight may start before and extend beyond the current span
          const start = Math.max(from, span.from);
          const end = Math.min(to, span.to);

          // Append the highlighted text
          spans.push({ text: docToString.slice(start, end), tags });
          position = end;

          // If the highlight continues beyond this span, break from this loop
          if (to > end) {
            break;
          }

          // Otherwise, move to the next highlight
          highlightPtr = highlightsIterator.next();
        }

        // If there are remaining spans that did not get highlighted, append them unstyled
        if (position !== span.to) {
          spans.push({
            text: docToString.slice(position, span.to),
            tags: "",
          });
        }
      }

      // Lines are indexed beginning at 1 instead of 0
      const lineNumber = index + 1;
      this.map.set(lineNumber, { line: spans, offset: lineStartOffset, prevImageData: null });
    }
  }

  public measure(context: CanvasRenderingContext2D): {
    charWidth: number;
    lineHeight: number;
  } {
    const { color, font, lineHeight } = this.getFontInfo("");

    context.textBaseline = "ideographic";
    context.fillStyle = color;
    context.font = font;

    return {
      charWidth: context.measureText("_").width,
      lineHeight: lineHeight,
    };
  }

  public beforeDraw() {
    this._fontInfoMap.clear(); // TODO: Confirm this worked for theme changes or get rid of it because it's slow
  }

  private nextBoundaryWithinLine(currentPosition: number) {
    if (this.view.lineWrapping) {
      console.log(currentPosition, this.view.moveToLineBoundary(EditorSelection.range(currentPosition, currentPosition), true, true));
      return this.view.moveToLineBoundary(EditorSelection.range(currentPosition, currentPosition), true, true).to
    }

    return null;
  }

  private drawSpan(ctx: DrawContext, span: TagSpan, info: FontInfo, offsetX: number, innerLineOffset: number) {
    let { context, charWidth, lineHeight, offsetY } = ctx;

    lineHeight = Math.max(lineHeight, info.lineHeight);


    switch (this._displayText) {
      case "characters": {
        // TODO: `fillText` takes up the majority of profiling time in `render`
        // Try speeding it up with `drawImage`
        // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081

        context.fillText(span.text, offsetX * charWidth, offsetY + lineHeight + innerLineOffset * lineHeight);
        return;
      }

      case "blocks": {
        const nonWhitespace = /\S+/g;
        let start: RegExpExecArray | null;
        while ((start = nonWhitespace.exec(span.text)) !== null) {
          const startX = (offsetX + start.index) * charWidth;
          let width = (nonWhitespace.lastIndex - start.index) * charWidth;

          // Reached the edge of the minimap
          if (startX > context.canvas.width) {
            break;
          }

          // Limit width to edge of minimap
          if (startX + width > context.canvas.width) {
            width = context.canvas.width - startX;
          }

          // Scaled 2px buffer between lines
          const yBuffer = 2 / Scale.SizeRatio;
          const height = lineHeight - yBuffer;

          context.fillStyle = info.color;
          context.globalAlpha = 0.65; // Make the blocks a bit faded
          context.beginPath();
          context.rect(startX, offsetY + innerLineOffset * lineHeight, width, height);
          context.fill();
        }
        return;
      }
    }
  }

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const line = this.get(lineNumber);
    if (!line) {
      return;
    }

    if (line.prevImageData) {
      ctx.context.putImageData(line.prevImageData, 0, ctx.offsetY);
      return;
    }

    let { context, charWidth, lineHeight, offsetY } = ctx;
    let offsetX = 0;

    let prevInfo: FontInfo | undefined;
    context.textBaseline = "ideographic";


    let nextBoundary = this.nextBoundaryWithinLine(line.offset);
    let innerLineCount = 0; // Used to offset Y when we wrap onto multiple lines
    let innerLineOffset = 0; // Used to offset X when we begin a new span

    for (const fullSpan of line.line) {
      /* Font info */
      const info = this.getFontInfo(fullSpan.tags);
      if (!prevInfo || prevInfo.color !== info.color) {
        context.fillStyle = info.color;
      }
      if (!prevInfo || prevInfo.font !== info.font) {
        context.font = info.font;
      }
      prevInfo = info;
      /* End font info */


      let spanExtendsBeyondLine = false;
      let spanOffset = 0;

      do {

        let overflow = 0;
        if (nextBoundary) {
          overflow = (line.offset + fullSpan.text.length + innerLineOffset) - nextBoundary;
        }

        let text = fullSpan.text;
        if (nextBoundary && overflow > 0) {
          text = fullSpan.text.slice(spanOffset, fullSpan.text.length - overflow);
          spanExtendsBeyondLine = true;
          spanOffset += text.length;
          nextBoundary = this.nextBoundaryWithinLine(nextBoundary + 1);
        } else {
          text = fullSpan.text.slice(spanOffset);
          spanExtendsBeyondLine = false;
        }

        this.drawSpan(ctx, { ...fullSpan, text }, info, offsetX, innerLineCount);

        if (spanExtendsBeyondLine) {
          innerLineCount++;
          offsetX = 0;
        } else {
          offsetX += text.length;
        }

      } while (spanExtendsBeyondLine);

      innerLineOffset += fullSpan.text.length;
    }

    this.set(lineNumber, {
      ...line,
      prevImageData: ctx.context.getImageData(
        0,
        ctx.offsetY,
        context.canvas.width,
        (innerLineCount + 1) * ctx.lineHeight
      )
    });
  }

  private getFontInfo(tags: string): FontInfo {
    const cached = this._fontInfoMap.get(tags);
    if (cached) {
      return cached;
    }

    // Create a mock token wrapped in a cm-line
    const mockToken = crelt("span", { class: tags });
    const mockLine = crelt(
      "div",
      { class: "cm-line", style: "display: none" },
      mockToken
    );
    this.view.contentDOM.appendChild(mockLine);

    // Get style information and store it
    const style = window.getComputedStyle(mockToken);
    const lineHeight = parseFloat(style.lineHeight) / Scale.SizeRatio;
    const result = {
      color: style.color,
      font: `${style.fontStyle} ${style.fontWeight} ${lineHeight}px ${style.fontFamily}`,
      lineHeight,
    };
    this._fontInfoMap.set(tags, result);

    // Clean up and return
    this.view.contentDOM.removeChild(mockLine);
    return result;
  }

  private themeChanged(): boolean {
    const previous = this._themeClasses;
    const now = new Set(this.view.dom.classList.values());
    this._themeClasses = now;

    if (!previous) {
      return true;
    }

    // Ignore certain classes being added/removed
    previous.delete("cm-focused");
    now.delete("cm-focused");

    if (previous.size !== now.size) {
      return true;
    }

    let containsAll = true;
    previous.forEach((theme) => {
      if (!now.has(theme)) {
        containsAll = false;
      }
    });

    return !containsAll;
  }
}

export function text(view: EditorView): TextState {
  return new TextState(view);
}
