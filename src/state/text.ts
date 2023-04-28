import { EditorState, Text, SelectionRange } from "@codemirror/state";
import { LineBasedState } from ".";
import { Highlighter, highlightTree } from "@lezer/highlight";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { highlightingFor, language } from "@codemirror/language";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { DrawContext, RangesWithState } from "./selections";
import { Config, Options } from "../Config";
import { LinesState } from "../LinesState";

type TagSpan = { text: string; tags: string };
type FontInfo = { color: string; font: string; fontSize: number };

const SCALE = 3;

export class TextState extends LineBasedState<Array<TagSpan>> {
  private _previousTree: Tree | undefined;
  private _displayText: Required<Options>["displayText"];
  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _themeClasses: string;

  public constructor(view: EditorView) {
    super(view);

    this._themeClasses = view.dom.classList.value;
  }

  private shouldUpdate(update: ViewUpdate) {
    // If the doc changed
    if (update.docChanged) {
      console.log(update.docChanged);
      return true;
    }

    // If configuration settings changed
    if (update.state.facet(Config) !== update.startState.facet(Config)) {
      return true;
    }

    // If the theme changed
    if (this._themeClasses !== this.view.dom.classList.value) {
      return true;
    }

    /* TODO handle folds changing */

    // TODO: True until above todo is handled
    return true;
  }

  public update(update: ViewUpdate) {
    if (!this.shouldUpdate(update)) {
      return;
    }
    this.map.clear();

    const parser = update.state.facet(language)?.parser;
    if (!parser) {
      console.log("TODO: Handle no parser....");
      return;
    }

    /* Store display text setting for rendering */
    this._displayText = update.state.facet(Config).displayText;

    /* If class list has changed, clear and recalculate the font info map */
    if (this._themeClasses !== this.view.dom.classList.value) {
      this._fontInfoMap.clear();
      this._themeClasses = this.view.dom.classList.value;
    }

    /* Incrementally parse the tree based on previous tree + changes */
    let treeFragments: ReadonlyArray<TreeFragment> | undefined = undefined;
    if (this._previousTree) {
      const previousFragments = TreeFragment.addTree(this._previousTree);

      const changedRanges: Array<ChangedRange> = [];
      update.changes.iterChangedRanges((fromA, toA, fromB, toB) =>
        changedRanges.push({ fromA, toA, fromB, toB })
      );

      treeFragments = TreeFragment.applyChanges(
        previousFragments,
        changedRanges
      );
    }

    /* Parse the document into a lezer tree */
    const doc = Text.of(update.state.doc.toString().split("\n"));
    const tree = parser.parse(doc.toString(), treeFragments);
    this._previousTree = tree;

    /* Highlight the document, and store the text and tags for each line */
    const highlighter: Highlighter = {
      style: (tags) => highlightingFor(update.state, tags),
    };

    for (const [index, line] of update.state.field(LinesState).entries()) {
      const spans: Array<TagSpan> = [];

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
        highlightTree(
          tree,
          highlighter,
          (from, to, tags) => {
            if (from > position) {
              spans.push({ text: doc.sliceString(position, from), tags: "" });
            }

            spans.push({ text: doc.sliceString(from, to), tags });
            position = to;
          },
          span.from,
          span.to
        );

        // If there are remaining spans that did not get highlighted, we append them here
        if (position !== span.to) {
          spans.push({
            text: doc.sliceString(position, span.to),
            tags: "",
          });
        }
      }

      // Lines are indexed beginning at 1 instead of 0
      const lineNumber = index + 1;
      this.map.set(lineNumber, spans);
    }
  }

  public measure(context: CanvasRenderingContext2D) {
    const info = this.getFontInfo("");
    context.textBaseline = "ideographic";
    context.fillStyle = info.color;
    context.font = info.font;
    return context.measureText("_").width;
  }

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const line = this.get(lineNumber);
    if (!line) {
      return;
    }

    let { context, charWidth, lineHeight, offsetY } = ctx;
    let offsetX = 0;

    for (const span of line) {
      const info = this.getFontInfo(span.tags);

      context.textBaseline = "ideographic";
      context.fillStyle = info.color;
      context.font = info.font;
      lineHeight = Math.max(lineHeight, info.fontSize);

      switch (this._displayText) {
        case "characters": {
          // TODO: `fillText` takes up the majority of profiling time in `render`
          // Try speeding it up with `drawImage`
          // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081

          context.fillText(span.text, offsetX, offsetY + lineHeight);
          offsetX += context.measureText(span.text).width;
          break;
        }

        case "blocks": {
          const nonWhitespace = /\S+/g;
          let start: RegExpExecArray | null;
          while ((start = nonWhitespace.exec(span.text)) !== null) {
            const spanOffsetX = start.index * charWidth;

            const width = (nonWhitespace.lastIndex - start.index) * charWidth;
            const height = lineHeight - 2; /* 2px buffer between lines */

            context.fillStyle = info.color;
            context.globalAlpha = 0.65; // Make the blocks a bit faded
            context.beginPath();
            context.rect(offsetX + spanOffsetX, offsetY, width, height);
            context.fill();
          }

          offsetX += span.text.length * charWidth;
          break;
        }
      }
    }
  }

  private getFontInfo(tags: string): FontInfo {
    const cached = this._fontInfoMap.get(tags);
    if (cached) {
      return cached;
    }

    // Create a mock token
    const mockToken = document.createElement("span");
    mockToken.setAttribute("class", tags);
    this.view.contentDOM.appendChild(mockToken);

    // Get style information and store it
    const style = window.getComputedStyle(mockToken);
    const fontSize = Math.floor(parseFloat(style.fontSize));
    const result = {
      color: style.color,
      font: `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`,
      fontSize,
    };
    this._fontInfoMap.set(tags, result);

    // Clean up and return
    this.view.contentDOM.removeChild(mockToken);
    return result;
  }
}

export function text(view: EditorView): TextState {
  return new TextState(view);
}
