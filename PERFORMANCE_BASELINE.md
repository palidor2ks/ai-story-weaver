# Performance Baseline & Weekly Monitoring

## Bundle analysis
- Run `npm run analyze` to generate `dist/stats.html` using Rollup Visualizer.
- Inspect large chunks first: charting, admin screens, share/image utilities.

## Lighthouse baseline
Capture baseline metrics weekly (mobile + desktop):
1. `npm run build`
2. `npm run preview -- --host 0.0.0.0 --port 4173`
3. Run Lighthouse and record:
   - LCP
   - INP
   - CLS
   - TTFB

## RUM baseline
Use your analytics provider to track real-user medians and p75:
- LCP
- INP
- CLS
- TTFB

Create a weekly log with date, release SHA, and metric deltas.

## Supabase query audit checklist
- Select only required columns in each query.
- Paginate large result sets.
- Ensure indexes exist on frequent filter/sort columns.
- Avoid loading tab/panel data until the user opens that UI.

## Image loading checklist
- Always provide `width` and `height` for non-critical images.
- Prefer lazy loading (`loading="lazy"`) where possible.
- Compress and serve appropriately sized assets per breakpoint.
