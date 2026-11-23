// mały klient CDP: node cdp.mjs <port> '<wyrażenie JS>'
const [port, expr] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id === 1) { console.log(JSON.stringify(m.result.result.value ?? m.result, null, 1)); ws.close(); } });
