# Minimap for Codemirror 6

<div style="display:flex">
    <span style="margin-right:4px">
        <a href="https://replit.com/github/replit/codemirror-minimap" title="Run on Replit badge"><img src="https://replit.com/badge/github/replit/codemirror-minimap" alt="Run on Replit badge" /></a>
    </span>
    <span>
        <a href="https://www.npmjs.com/package/@replit/codemirror-minimap" title="NPM version badge"><img src="https://img.shields.io/npm/v/@replit/codemirror-minimap?style=flat&color=orange" height="32" alt="NPM version badge" /></a>
    </span>
</div>
<br />
<div style="display:flex">
    <img height="275" alt="image" src="https://github.com/replit/codemirror-minimap/assets/16962017/cb2f33a2-726f-4395-a8bd-8d219a74b1e6">
    <img height="275" alt="image" src="https://github.com/replit/codemirror-minimap/assets/16962017/3b148589-0883-4eb0-8b26-584909cb0900">
</div>
<br />


## Installation

```
bun i @replit/codemirror-minimap
```

## Usage

```typescript
import { basicSetup, EditorView } from 'codemirror';
import { showMinimap } from "@replit/codemirror-minimap"

let create = (v: EditorView) => {
  const dom = document.createElement('div');
  return { dom }
}

let view = new EditorView({
  doc: "",
  extensions: [
    basicSetup,
    showMinimap.compute(['doc'], (state) => {
      return {
        create,
        /* optional */
        displayText: 'blocks',
        showOverlay: 'always',
        gutters: [ { 1: '#00FF00', 2: '#00FF00' } ],
      }
    }),
  ],
  parent: document.querySelector('#editor'),
})
```

## Configuration Options

The minimap extension exposes a few configuration options:

**`displayText`**: customize how the editor text is displayed:

```typescript
/**
 * displayText?: "blocks" | "characters";
 * Defaults to "characters"
 */
{
  displayText: 'blocks'
}
```

**`eventHandlers`**: attach event handlers to the minimap container element

```typescript
/**
 * eventHandlers?: {[event in keyof DOMEventMap]?: EventHandler<event>}
 */
{
  eventHandlers: {
    'contextmenu': (e) => onContextMenu(e)
  }
}
```

**`showOverlay`**: customize when the overlay showing the current viewport is visible

```typescript
/**
 * showOverlay?: "always" | "mouse-over";
 * Defaults to "always"
 */
{
  showOverlay: 'mouse-over'
}
```

**`gutters`**: display a gutter on the left side of the minimap at specific lines

```typescript
/**
 * gutters?: Array<Record<number, string>>
 * Where `number` is line number, and `string` is a color
 */
{
  gutters: [ { 1: '#00FF00', 2: 'green', 3: 'rgb(0, 100, 50)' } ]
}
```

## Build and Publish

To build from source:

```
bun build
```

To publish a new version to NPM registry:

```
npm publish
```
