# Minimap for Codemirror 6

<div style="display:flex">
    <span style="margin-right:4px">
        <a href="https://replit.com/github/replit/codemirror-minimap" title="Run on Replit badge"><img src="https://replit.com/badge/github/replit/codemirror-minimap" alt="Run on Replit badge" /></a>
    </span>
    <span>
        <a href="https://www.npmjs.com/package/@replit/codemirror-minimap" title="NPM version badge"><img src="https://img.shields.io/npm/v/@replit/codemirror-minimap?style=flat&color=orange" height="32" alt="NPM version badge" /></a>
    </span>
</div>

## Installation

```
pnpm i @replit/codemirror-minimap
```

## Usage

```
import { basicSetup, EditorView } from 'codemirror';
import { minimap } from "@replit/codemirror-minimap"

let view = new EditorView({
  doc: "",
  extensions: [
    basicSetup,
    minimap(),
  ],
  parent: document.querySelector('#editor'),
})
```

## Configuration Options

The minimap extension exposes a few configuration options:

**`displayText`**: customize how the editor text is displayed:

```
/**
 * displayText?: "blocks" | "characters";
 * Defaults to "characters"
 */
minimap({
    displayText: 'blocks'
})
```

**`showOverlay`**: customize when the overlay showing the current viewport is visible

```
/**
 * showOverlay?: "always" | "mouse-over";
 * Defaults to "always"
 */
minimap({
    showOverlay: 'mouse-over'
})
```

## Build and Publish

To build from source:

```
pnpm build
```

To publish a new version to NPM registry:

```
pnpm publish
```
