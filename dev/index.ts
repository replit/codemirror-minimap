import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import { linter, Diagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

import snippets from "./snippets";

import { minimap } from "../src/index.new";

(() => {
  /* Apply initial configuration from controls */
  const doc = getDoc(window.location.hash);
  const showMinimap = getShowMinimap(window.location.hash);
  const showOverlay = getShowOverlay(window.location.hash);
  const displayText = getDisplayText(window.location.hash);
  const mode = getMode(window.location.hash);
  const themeCompartment = new Compartment();
  const extensionCompartment = new Compartment();

  const testLinter = linter((view) => {
    let diagnostics: Diagnostic[] = [];
    syntaxTree(view.state)
      .cursor()
      .iterate((node) => {
        if (node.name == "RegExp")
          diagnostics.push({
            from: node.from,
            to: node.to,
            severity: "warning",
            message: "Regular expressions are FORBIDDEN",
            actions: [
              {
                name: "Remove",
                apply(view, from, to) {
                  view.dispatch({ changes: { from, to } });
                },
              },
            ],
          });
      });
    return diagnostics;
  });

  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        /* Default extensions */
        basicSetup,
        javascript(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.contentAttributes.of({
          /* Disabling grammarly */
          "data-gramm": "false",
          "data-gramm_editor": "false",
          "data-enabled-grammarly": "false",
        }),
        testLinter,
        themeCompartment.of(mode === "dark" ? oneDark : []),

        /* Minimap extension */
        extensionCompartment.of(
          showMinimap ? minimap({ showOverlay, displayText }) : []
        ),
      ],
    }),
    parent: document.getElementById("editor") as HTMLElement,
  });

  /* Listen to changes and apply updates from controls */
  window.addEventListener("hashchange", (e: HashChangeEvent) => {
    const prevDoc = getDoc(e.oldURL);
    const newDoc = getDoc(e.newURL);

    if (prevDoc !== newDoc) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newDoc },
      });
    }

    const showMinimap = getShowMinimap(e.newURL);
    const showOverlay = getShowOverlay(window.location.hash);
    const displayText = getDisplayText(window.location.hash);
    const mode = getMode(window.location.hash);

    view.dispatch({
      effects: [
        extensionCompartment.reconfigure(
          showMinimap ? minimap({ showOverlay, displayText }) : []
        ),
        themeCompartment.reconfigure(mode === "dark" ? oneDark : []),
      ],
    });
  });
})();

/* Helpers */
function getDoc(url: string): string {
  const length = getHashValue("length", url);

  if (length && length in snippets) {
    return snippets[length];
  }

  return snippets.long;
}
function getShowMinimap(url: string): boolean {
  return getHashValue("minimap", url) === "show";
}
function getShowOverlay(url: string): "always" | "mouse-over" | undefined {
  const value = getHashValue("overlay", url);
  if (value === "always" || value === "mouse-over") {
    return value;
  }

  return undefined;
}
function getDisplayText(url: string): "blocks" | "characters" | undefined {
  const value = getHashValue("text", url);
  if (value === "blocks" || value === "characters") {
    return value;
  }

  return undefined;
}
function getMode(url: string): "dark" | "light" {
  return getHashValue("mode", url) === "dark" ? "dark" : "light";
}
function getHashValue(key: string, url: string): string | undefined {
  const hash = url.split("#").slice(1);
  const pair = hash.find((kv) => kv.startsWith(`${key}=`));
  return pair ? pair.split("=").slice(1)[0] : undefined;
}
