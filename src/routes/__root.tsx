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
    --line: #dedbd2; --card: #fff; --accent: #b4482a; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16150f; --fg: #f2f0e8; --muted: #9b998e; --line: #34322a;
      --card: #1e1d16; --accent: #e8825e; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 ui-sans-serif,
    -apple-system, system-ui, sans-serif; padding: 40px 16px; }
  main { max-width: 620px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  p.sub { color: var(--muted); margin: 0 0 28px; font-size: 14px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  input, select, button { font: inherit; border-radius: 8px; border: 1px solid var(--line);
    padding: 10px 12px; background: var(--card); color: var(--fg); }
  input:focus-visible, select:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .row > * { flex: 1 1 200px; }
  button { background: var(--accent); color: #fff; border-color: transparent;
    cursor: pointer; font-weight: 500; }
  button:disabled { opacity: 0.5; cursor: default; }
  .card { margin-top: 24px; border: 1px solid var(--line); border-radius: 10px;
    padding: 16px; background: var(--card); }
  .bar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden;
    margin: 12px 0 8px; }
  .bar > i { display: block; height: 100%; background: var(--accent);
    transition: width 0.3s ease; }
  .bar.indet > i { width: 35%; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
  .meta { color: var(--muted); font-size: 13px; display: flex; justify-content: space-between;
    gap: 12px; }
  .err { color: var(--accent); white-space: pre-wrap; word-break: break-word;
    font-size: 13px; margin: 0; }
  a.dl { display: inline-block; margin-top: 12px; background: var(--accent); color: #fff;
    padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 500; }
  code { background: var(--line); padding: 1px 5px; border-radius: 4px; font-size: 13px; }
`
