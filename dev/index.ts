import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";

import snippets from "./snippets";

import { minimap } from "../src/index.new";

(() => {
  /* Apply initial configuration from controls */
  const doc = getDoc(window.location.hash);
  const showMinimap = getShowMinimap(window.location.hash);
  const showOverlay = getShowOverlay(window.location.hash);
  const displayText = getDisplayText(window.location.hash);
  const compartment = new Compartment();

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

        /* Minimap extension */
        compartment.of(
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

    view.dispatch({
      effects: compartment.reconfigure(
        showMinimap ? minimap({ showOverlay, displayText }) : []
      ),
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
function getHashValue(key: string, url: string): string | undefined {
  const hash = url.split("#").slice(1);
  const pair = hash.find((kv) => kv.startsWith(`${key}=`));
  return pair ? pair.split("=").slice(1)[0] : undefined;
}
