import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";

import snippets from "./snippets";

import { testExtension } from "../src/index.new";

(() => {
  const query = new URLSearchParams(window.location.search);
  const length = query.get("length");

  let doc = snippets.long;
  if (length && length in snippets) {
    doc = snippets[length];
  }

  const defaultExtensions = [
    basicSetup,
    javascript(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
  ];

  const minimapExtensions = [testExtension];

  new EditorView({
    state: EditorState.create({
      doc,
      extensions: [defaultExtensions, minimapExtensions],
    }),
    parent: document.getElementById("editor") as HTMLElement,
  });
})();
