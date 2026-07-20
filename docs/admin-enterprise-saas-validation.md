# Enterprise Admin Validation Commands

```bash
npm run typecheck
npm run lint
npx vitest run lib/admin/__tests__/location-workspace.test.ts
npm run build
```

Preview acceptance must verify all eight canonical routes, Menu editing and preview, role restrictions, location scoping, mobile layout, Safari, Chrome, keyboard navigation, visible focus, and error recovery.
