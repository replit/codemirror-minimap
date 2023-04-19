# codemirror-minimap

```
Develop: pnpm dev
Build: pnpm build
```

### Todo

Pre 0.1:

- Long documents that extend minimap beyond height
  - Most things done here, just need to udpate click handler
- New API:

  - DONE: Text
  - Diag
    - Don't show when line is collapsed
    - Test offsets are correct when lines are collapsed
  - Sele

- Test changing editor heights

P2

- Clean up selection styling
- BG color issue to use background color instead of gutter BG
- Make blocks/chars more crisp - look into scaling
- For block rendering: You could instead pick the primary color for each whitespace-sep token, might make it look cleaner.
- Also for block rendering: Could figure out how to make whitepspace chars take up 1/2 the size (would need non-ws, to fill in the difference). Perhaps this is just leading and trailing characters get an extra 1/4 pt width

P3

- Git integration
- Optimize font rendering w/ offline canvas
- Inline widgets
