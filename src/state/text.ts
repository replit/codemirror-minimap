import { EditorState, Text, SelectionRange } from "@codemirror/state";
import { LineBasedState } from ".";
import { Highlighter, highlightTree } from "@lezer/highlight";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { highlightingFor, language } from "@codemirror/language";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { DrawContext, RangesWithState } from "./selections";
import { Config, config } from "../config";

type TagSpan = { text: string; tags: string };
type FontInfo = { color: string; font: string; fontSize: number };

const SCALE = 3;

export class TextState extends LineBasedState<Array<TagSpan>> {
  private _previousTree: Tree | undefined;
  private _displayText: Required<Config>["displayText"];
  private _fontInfoMap: Map<string, FontInfo> = new Map();
  private _themeClasses: string;

  public constructor(view: EditorView) {
    super(view);

    this._themeClasses = view.dom.classList.value;
  }

  public update({ lines, update }: RangesWithState) {
    // Optimize individual rerenders:
    // If doc hasn't changed, we don't need to rebuild the state
    // TODO: This isn't right. Need to handle
    // - Config change
    // - Theme change
    if (this.map.size > 0 && update.startState.doc.eq(update.state.doc)) {
      // return;
    }

    this.map.clear();

    const parser = update.state.facet(language)?.parser;
    if (!parser) {
      console.log("TODO: Handle no parser....");
      return;
    }

    /* Store display text setting for rendering */
    this._displayText = update.state.facet(config).displayText;

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

    /* Highlight the document, and store the tags for each line */
    // let lineIndex = 0;
    const highlighter: Highlighter = {
      style: (tags) => highlightingFor(update.state, tags),
    };

    for (const [index, line] of lines.entries()) {
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

        // // If it's an empty span we can short circuit
        // if (span.from === span.to) {
        //   // console.log("Hi", line.from, line.to);
        //   const span = this.buildTagSpan(
        //     { from: span.from, to: span.to },
        //     line
        //   );
        //   this.setLine(index, span);
        //   continue;
        // }

        let foldIndex = 0;
        let position = span.from;
        highlightTree(
          tree,
          highlighter,
          (from, to, tags) => {
            // console.log("Current fold", line.folded[foldIndex]);

            if (from > position) {
              spans.push({ text: doc.sliceString(position, from), tags: "" });
              // spans.push(this.buildTagSpan({ from: position, to: from }, span));
              // const span = this.buildTagSpan(
              //   { from: position, to: from },
              //   span
              // );
              // this.setLine(index, span);
            }

            spans.push({ text: doc.sliceString(from, to), tags });
            // spans.push(this.buildTagSpan({ from, to, tags }, span));
            // this.setLine(index, span);

            position = to;

            // if (from > pos) {
            //   spans.push({ text: doc.sliceString(pos, from) });
            // }

            // spans.push({ text: doc.sliceString(from, to), tags });

            // pos = to;

            // console.log("Highlighted", from, to, tags);
          },
          span.from,
          span.to
        );

        // If there are remaining spans that did not get highlighted, we append them here
        if (position !== span.to) {
          spans.push({ text: doc.sliceString(position, span.to), tags: "" });
          // spans.push(this.buildTagSpan({ from: position, to: span.to }, span));
          // this.setLine(index, span);
        }
      }

      // Lines are indexed beginning at 1 instead of 0
      const lineNumber = index + 1;
      this.map.set(lineNumber, spans);
    }

    // highlightTree(tree, highlighter, (from, to, tags) => {
    //   // Iterate through lines until we reach the line where the tag begins
    //   while (lineIndex < lines.length && lines[lineIndex].to < from) {
    //     lineIndex++;
    //   }

    //   do {
    //     // Add the tag span to the line map
    //     const span = this.buildTagSpan({ from, to, tags }, lines[lineIndex]);
    //     this.setLine(lineIndex, span);

    //     if (to <= lines[lineIndex].to) {
    //       // The tag span finished on our current line
    //       break;
    //     }
    //     lineIndex++;
    //   } while (lineIndex < lines.length);
    // });
  }

  /**
   * IDEAL DATA STRUCTURE:
   * Array< {tag: "tag-string", text: "text-string"} >
   *
   * Then you just loop through and apply them, we've already taken care of the folding in state
   */
  public drawLine(ctx: DrawContext, lineNumber: number) {
    const line = this.get(lineNumber);
    if (!line) {
      return;
    }

    let { context, charWidth, lineHeight, offsetY } = ctx;
    // console.log(lineNumber, line, offsetY);

    let offsetX = 0;

    for (const span of line) {
      const info = this.getFontInfo(span.tags);

      context.textBaseline = "ideographic";
      context.fillStyle = info.color;
      context.font = info.font;
      lineHeight = Math.max(lineHeight, info.fontSize);

      // console.log(lineHeight);

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
  // console.log("creating...");
  return new TextState(view);
}
