// Посредник Telegram для игры «Средневековье» — бесплатный Cloudflare Worker: сервер игры → Worker → api.telegram.org.
// Нужен, когда сервер игры в России: оттуда api.telegram.org заблокирован, а Cloudflare доступен.
// 1) dash.cloudflare.com → Workers & Pages → Create → Start with Hello World! → Deploy → Edit code:
//    вставить этот файл целиком, в KEY вписать свой ключ (16+ латинских букв и цифр, придумать самому) → Deploy.
// 2) На сервере игры:  sh /opt/war/game/tgapi.sh https://<имя>.<поддомен>.workers.dev/<KEY>
// Без ключа в начале пути Worker отвечает 403; пропускает только запросы к Bot API (bot<токен>/… и file/bot<токен>/…).
// Токены ботов идут внутри HTTPS и нигде не сохраняются. Бесплатного лимита (100 000 запросов в сутки) хватает с запасом.
const KEY = 'ВПИШИТЕ_СВОЙ_КЛЮЧ';
export default {
  async fetch(req) {
    if (!/^[A-Za-z0-9]{16,}$/.test(KEY)) return new Response('KEY not set', { status: 500 });
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/' + KEY + '/')) return new Response('Forbidden', { status: 403 });
    const path = url.pathname.slice(KEY.length + 1);
    if (!/^\/(file\/)?bot\d+(:[\w-]+)?\//.test(path)) return new Response('Not Found', { status: 404 });
    const headers = new Headers();
    const type = req.headers.get('content-type');
    if (type) headers.set('content-type', type);
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.arrayBuffer();
    return fetch('https://api.telegram.org' + path + url.search, { method: req.method, headers, body });
  },
};
