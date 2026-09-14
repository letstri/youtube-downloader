import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'YouTube Downloader' },
    ],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{css}</style>
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}

const css = `
  :root { color-scheme: light dark; --bg: #fbfbfa; --fg: #16150f; --muted: #6f6d63;
    --line: #dedbd2; --card: #fff; --accent: #b4482a; --accent-soft: #f6e7e1; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16150f; --fg: #f2f0e8; --muted: #9b998e; --line: #34322a;
      --card: #1e1d16; --accent: #e8825e; --accent-soft: #2e2119; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 ui-sans-serif,
    -apple-system, system-ui, sans-serif; padding: 48px 16px 64px; }
  main { max-width: 560px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { font-size: 23px; margin: 0 0 4px; letter-spacing: -0.015em; }
  p.sub { color: var(--muted); margin: 0; font-size: 14px; }

  form { display: flex; flex-direction: column; gap: 14px; }
  input[type=url], button { font: inherit; border-radius: 9px; padding: 11px 13px; }
  input[type=url] { border: 1px solid var(--line); background: var(--card); color: var(--fg);
    width: 100%; }
  input[type=url]:focus-visible, button:focus-visible, label:focus-within {
    outline: 2px solid var(--accent); outline-offset: 1px; }
  input[type=url]:disabled { opacity: 0.6; }

  .preview { display: flex; gap: 12px; align-items: center; border: 1px solid var(--line);
    border-radius: 9px; padding: 9px; background: var(--card); }
  .preview.loading { opacity: 0.6; }
  .preview img, .thumb-skeleton { width: 112px; height: 63px; border-radius: 5px;
    object-fit: cover; flex: none; background: var(--line); }
  .preview-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .preview-text strong { font-weight: 550; font-size: 14px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .preview-text span { color: var(--muted); font-size: 13px; }

  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
  fieldset:disabled { opacity: 0.6; }
  legend { padding: 0; margin-bottom: 7px; color: var(--muted); font-size: 13px; }
  fieldset label { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px;
    align-items: center; border: 1px solid var(--line); border-radius: 9px;
    padding: 10px 13px; cursor: pointer; background: var(--card); }
  fieldset label.picked { border-color: var(--accent); background: var(--accent-soft); }
  fieldset input[type=radio] { accent-color: var(--accent); margin: 0; grid-row: span 2; }
  fieldset label small { color: var(--muted); font-size: 12.5px; grid-column: 2; }

  button { background: var(--accent); color: #fff; border: 1px solid transparent;
    cursor: pointer; font-weight: 500; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.ghost { background: transparent; color: var(--muted); border-color: var(--line);
    width: 100%; margin-top: 12px; font-weight: 400; }
  button.ghost:hover { color: var(--fg); border-color: var(--muted); }

  .card { margin-top: 22px; border: 1px solid var(--line); border-radius: 10px;
    padding: 15px; background: var(--card); }
  .bar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden;
    margin-bottom: 11px; }
  .bar > i { display: block; height: 100%; background: var(--accent);
    transition: width 0.3s ease; }
  .bar.indet > i { width: 35%; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { from { margin-left: -35%; } to { margin-left: 100%; } }
  @media (prefers-reduced-motion: reduce) {
    .bar.indet > i { animation: none; width: 100%; opacity: 0.45; }
    .bar > i { transition: none; }
  }

  .meta { color: var(--muted); font-size: 13px; display: flex; justify-content: space-between;
    gap: 12px; min-height: 20px; }
  .meta .filename { color: var(--fg); word-break: break-all; }
  .note { color: var(--muted); font-size: 12.5px; margin: 10px 0 0; }
  .err { color: var(--accent); white-space: pre-wrap; word-break: break-word;
    font-size: 13px; margin: 0; }
  a.dl { display: block; text-align: center; margin-top: 13px; background: var(--accent);
    color: #fff; padding: 11px 14px; border-radius: 9px; text-decoration: none;
    font-weight: 500; }
`
