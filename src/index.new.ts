import {
  EditorState,
  Text,
  SelectionRange,
  Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const testExtension: Extension = [
  EditorView.updateListener.of((update) => {
    console.log("New  hello selection", update.state.selection);
  }),
];
