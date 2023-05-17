import { LineBasedState } from "./linebasedstate";
import { Highlighter, highlightTree } from "@lezer/highlight";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { highlightingFor, language } from "@codemirror/language";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { DrawContext } from "./types";
import { Config, Options, Scale } from "./Config";
import { LinesState, foldsChanged } from "./LinesState";
import crelt from "crelt";
import { ChangeSet, EditorState } from "@codemirror/state";

type TagSpan = { text: string; tags: string };
type FontInfo = { color: string; font: string; lineHeight: number };

export class TextState extends LineBasedState<Array<TagSpan>> {
  private _previousTree: Tree | undefined;
  private _displayText: Required<Options>["displayText"];
  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _themeClasses: DOMTokenList | undefined;

  public constructor(view: EditorView) {
    super(view);

    this._themeClasses = view.dom.classList;
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

        // If we don't have syntax highlighting, just push the whole span unstyled
        if (!tree) {
          spans.push({ text: doc.sliceString(span.from, span.to), tags: "" });
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

  public drawLine(ctx: DrawContext, lineNumber: number) {
    const line = this.get(lineNumber);
    if (!line) {
      return;
    }

    let { context, charWidth, lineHeight, offsetY } = ctx;
    let offsetX = 0;

    let prevInfo: FontInfo | undefined;
    context.textBaseline = "ideographic";

    for (const span of line) {
      const info = this.getFontInfo(span.tags);

      if (!prevInfo || prevInfo.color !== info.color) {
        context.fillStyle = info.color;
      }

      if (!prevInfo || prevInfo.font !== info.font) {
        context.font = info.font;
      }

      prevInfo = info;

      lineHeight = Math.max(lineHeight, info.lineHeight);

      switch (this._displayText) {
        case "characters": {
          // TODO: `fillText` takes up the majority of profiling time in `render`
          // Try speeding it up with `drawImage`
          // https://stackoverflow.com/questions/8237030/html5-canvas-faster-filltext-vs-drawimage/8237081

          context.fillText(span.text, offsetX, offsetY + lineHeight);
          offsetX += span.text.length * charWidth;
          break;
        }

        case "blocks": {
          const nonWhitespace = /\S+/g;
          let start: RegExpExecArray | null;
          while ((start = nonWhitespace.exec(span.text)) !== null) {
            const startX = offsetX + start.index * charWidth;
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
            context.rect(startX, offsetY, width, height);
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
    const now = this.view.dom.classList;
    this._themeClasses = now;

    if (!previous) {
      return true;
    }

    // Ignore certain classes being added/removed
    previous.remove("cm-focused");
    now.remove("cm-focused");

    if (previous.length !== now.length) {
      return true;
    }

    for (const theme in previous.entries()) {
      if (!now.contains(theme)) {
        return true;
      }
    }

    return false;
  }
}

export function text(view: EditorView): TextState {
  return new TextState(view);
}
