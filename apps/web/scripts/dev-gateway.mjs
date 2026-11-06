/** Local contract harness, never imported by Next.js or used as a payment gateway. */
import { createServer } from 'node:http';
import { fixtures } from '../src/lib/fixtures.ts';
const port = Number(process.env.MOCK_GATEWAY_PORT ?? 8788);
let data = fixtures();
let failed = new Set();
const streams = new Set();
const emit = (event, body) => { for (const stream of streams) stream.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`); };
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin','*');
  response.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers','Content-Type');
  response.setHeader('Cache-Control','no-store');
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const json = (body, status = 200) => { response.writeHead(status,{'Content-Type':'application/json'}); response.end(JSON.stringify(body)); };
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  if (url.pathname === '/__test' && request.method === 'POST') {
    try {
      let input = ''; for await (const chunk of request) { input += chunk; if (input.length > 10000) throw new Error('Input too large'); }
      const command = JSON.parse(input);
      if (command.reset) { data = fixtures(); failed.clear(); }
      if (Array.isArray(command.fail)) failed = new Set(command.fail);
      if (command.empty) { data.devices = []; data.agents = []; data.audit = []; }
      if (command.device) {
        const device = data.devices.find(d => d.id === command.device.id);
        if (device) { Object.assign(device, command.device); emit('device',{deviceId:device.id,status:device.status,relay:device.relay}); }
      }
      if (command.session) {
        const session = data.sessions.find(s => s.id === command.session.id);
        if (session) {
          Object.assign(session,command.session);
          const at = Math.floor(Date.now()/1000);
          session.events.push({state:session.state,at,detail:'Local contract harness update.'});
          const row = data.audit.find(a => a.sessionId === session.id);
          if (row) { row.state = session.state; row.at = at; }
          emit('session',{sessionId:session.id,state:session.state,at,detail:'Contract harness update.'});
        }
      }
      json({ok:true});
    } catch { json({error:{code:'INTERNAL',message:'Invalid test command'}},400); }
    return;
  }
  if (failed.has(url.pathname)) { json({error:{code:'INTERNAL',message:'Contract harness injected failure'}},503); return; }
  if (url.pathname === '/health') { json({ok:true,mode:'contract-harness'}); return; }
  if (url.pathname === '/events') {
    response.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
    response.write(': contract harness connected\n\n'); streams.add(response);
    request.on('close',() => streams.delete(response)); return;
  }
  if (url.pathname === '/devices') { json(data.devices); return; }
  if (url.pathname === '/agents') { json(data.agents); return; }
  if (url.pathname === '/audit') { json(data.audit); return; }
  if (url.pathname.startsWith('/sessions/')) {
    const session = data.sessions.find(s => s.id === decodeURIComponent(url.pathname.slice('/sessions/'.length)));
    json(session ?? {error:{code:'INTERNAL',message:'Session not found'}},session ? 200 : 404); return;
  }
  if (url.pathname === '/stepup/callback') {
    const code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!state?.startsWith('contract-')) { json({error:{code:'STEP_UP_DENIED',message:'Unknown state'}},403); return; }
    const result = url.searchParams.has('error') ? 'DENIED' : ({approved:'APPROVED',denied:'DENIED',expired:'EXPIRED'})[code];
    if (!result) { json({error:{code:'STEP_UP_DENIED',message:'Invalid code'}},403); return; }
    json({sessionId:'s_stepup',result}); return;
  }
  if (/^\/stepup\/[^/]+\/start$/.test(url.pathname) && request.method === 'POST') {
    json({authorizeUrl:'https://world-id-demo.invalid/authorize?state=contract-demo'}); return;
  }
  json({error:{code:'INTERNAL',message:'Route not found'}},404);
});
const heartbeat = setInterval(() => { for (const stream of streams) stream.write(': keepalive\n\n'); },10000);
server.listen(port,'127.0.0.1',() => console.log(`Contract gateway: http://127.0.0.1:${port} (sample data; no payments, identity, or hardware)`));
function close() { clearInterval(heartbeat); for (const stream of streams) stream.end(); server.close(() => process.exit(0)); }
process.on('SIGINT',close); process.on('SIGTERM',close);
