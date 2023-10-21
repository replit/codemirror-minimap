import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState, Compartment, StateEffect, StateField } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import { linter, Diagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { Change, diff } from '@codemirror/merge'

import snippets from "./snippets";

import { showMinimap } from "../src/index";

const BasicExtensions = [
  basicSetup,
  javascript(),
  drawSelection(),
  EditorState.allowMultipleSelections.of(true),
  EditorView.contentAttributes.of({
    /* Disabling grammarly */
    "data-gramm": "false",
    "data-gramm_editor": "false",
    "data-enabled-grammarly": "false",
  })
]

const setShownState = StateEffect.define<boolean>();
const shownState = StateField.define<boolean>({
  create: () => getShowMinimap(window.location.hash),
  update: (v, tr) => {
    for (const ef of tr.effects) {
      if (ef.is(setShownState)) {
        v = ef.value;
      }
    }
    return v;
  }
});

const setOverlayState = StateEffect.define<"always" | "mouse-over" | undefined>();
const overlayState = StateField.define<"always" | "mouse-over" | undefined>({
  create: () => getShowOverlay(window.location.hash),
  update: (v, tr) => {
    for (const ef of tr.effects) {
      if (ef.is(setOverlayState)) {
        v = ef.value;
      }
    }
    return v;
  }
});

const setDisplayTextState = StateEffect.define<"blocks" | "characters" | undefined>();
const displayTextState = StateField.define<"blocks" | "characters" | undefined>({
  create: () => getDisplayText(window.location.hash),
  update: (v, tr) => {
    for (const ef of tr.effects) {
      if (ef.is(setDisplayTextState)) {
        v = ef.value;
      }
    }
    return v;
  }
});

const wrapCompartment = new Compartment();
function maybeWrap() {
  return getLineWrap(window.location.hash) ? EditorView.lineWrapping : []
}

const lintCompartment = new Compartment();
function maybeLint() {
  return getLintingEnabled(window.location.hash) ? linter((view) => {
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

        if (node.name == "BlockComment") {
          diagnostics.push({
            from: node.from,
            to: node.to,
            severity: "error",
            message: "Block comments are FORBIDDEN",
            actions: [
              {
                name: "Remove",
                apply(view, from, to) {
                  view.dispatch({ changes: { from, to } });
                },
              },
            ],
          });
        }
      });
    return diagnostics;
  }) : []
}

const themeCompartment = new Compartment();
function maybeDark() {
  return getMode(window.location.hash) === 'dark' ? oneDark : []
}

const diffState = StateField.define<{ original: string, changes: Array<Change> }>({
  create: state => ({ original: state.doc.toString(), changes: [] }),
  update: (value, tr) => {
    if (!tr.docChanged) {
      return value;
    }

    return {
      original: value.original,
      changes: Array.from(diff(value.original, tr.state.doc.toString()))
    };
  }
});



const view = new EditorView({
  state: EditorState.create({
    doc: getDoc(window.location.hash),
    extensions: [
      BasicExtensions,

      [
        shownState,
        diffState,
        overlayState,
        displayTextState,
        wrapCompartment.of(maybeWrap()),
        lintCompartment.of(maybeLint()),
        themeCompartment.of(maybeDark()),
      ],

      showMinimap.compute([shownState, diffState, overlayState, displayTextState], (s) => {
        if (!s.field(shownState, false)) {
          return null;
        }

        const create = () => {
          const dom = document.createElement('div');
          return { dom };
        }

        const showOverlay = s.field(overlayState, false);
        const displayText = s.field(displayTextState, false);

        // TODO convert diffState -> changed line information
        // I'm just mocking this in for now
        const gutter: Record<number, string> = {};
        for (let i = 0; i < s.doc.lines; i++) {
          gutter[i] = 'green'
        }

        return { create, showOverlay, displayText, gutters: [gutter] }
      }),
    ],
  }),
  parent: document.getElementById("editor") as HTMLElement,
});

/* Listen to changes and apply updates from controls */
window.addEventListener("hashchange", (e: HashChangeEvent) => {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: getDoc(e.newURL) },
    effects: [
      setShownState.of(getShowMinimap(e.newURL)),
      setOverlayState.of(getShowOverlay(e.newURL)),
      setDisplayTextState.of(getDisplayText(e.newURL)),
      wrapCompartment.reconfigure(maybeWrap()),
      lintCompartment.reconfigure(maybeLint()),
      themeCompartment.reconfigure(maybeDark()),
    ]
  })
});


/* Helpers */
function getDoc(url: string): string {
  const length = getHashValue("length", url);

  if (length && length in snippets) {
    return snippets[length];
  }

  return snippets.long;
}
function getShowMinimap(url: string): boolean {
  return getHashValue("minimap", url) !== "hide";
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
function getLineWrap(url: string): boolean {
  const value = getHashValue("wrapping", url);
  return value == "wrap";
}
function getMode(url: string): "dark" | "light" {
  return getHashValue("mode", url) === "dark" ? "dark" : "light";
}
function getLintingEnabled(url: string): boolean {
  return getHashValue("linting", url) === "disabled" ? false : true;
}
function getHashValue(key: string, url: string): string | undefined {
  const hash = url.split("#").slice(1);
  const pair = hash.find((kv) => kv.startsWith(`${key}=`));
  return pair ? pair.split("=").slice(1)[0] : undefined;
}
