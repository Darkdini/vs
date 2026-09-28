'use strict';
// Смоук-тест браузерного клиента: HTTP (страница) + WebSocket JSON-протокол.
// Нужен Node 22+ (встроенный WebSocket); на более старых версиях тест пропускается.

const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawn } = require('child_process');

if (typeof WebSocket === 'undefined') { console.log('web-smoke: пропущен (нет встроенного WebSocket, нужен Node 22+)'); process.exit(0); }

const WEB_PORT = 26000 + Math.floor(Math.random() * 1000);
const DB = path.join(os.tmpdir(), `tw-web-smoke-${process.pid}.json`);

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, WEB_PORT: String(WEB_PORT), HOST: '127.0.0.1', DB, SPEED: '2000', SAVE_MS: '500', NO_CAPTCHA: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('браузерный клиент')) resolve(child); }));
}

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${WEB_PORT}/ws`);
  const inbox = []; const waiters = [];
  const opened = new Promise((r) => { ws.onopen = r; }); // подписываемся сразу, иначе событие можно пропустить
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (process.env.DBG && (m.t === 'toast' || m.t === 'error')) console.log('  <', m.t, m.msg); inbox.push(m); flush(); };
  function flush() {
    for (const w of [...waiters]) {
      const i = inbox.findIndex(w.pred);
      if (i >= 0) { const [m] = inbox.splice(i, 1); waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
    }
  }
  return {
    open: () => opened,
    send: (m) => ws.send(JSON.stringify(m)),
    expect: (t, pred = () => true) => new Promise((resolve, reject) => {
      waiters.push({ pred: (m) => m.t === t && pred(m), resolve }); flush();
      setTimeout(() => reject(new Error(`timeout waiting ${t}`)), 5000);
    }),
    close: () => ws.close(),
  };
}

(async () => {
  const server = await startServer();
  const a = client(), b = client();
  try {
    const html = await (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).text();
    assert.match(html, /Война Королей/);
    assert.ok((await fetch(`http://127.0.0.1:${WEB_PORT}/app.js`)).ok);
    console.log('✓ страница и скрипт отдаются');

    await a.open();
    a.send({ t: 'hello' });
    const cat = (await a.expect('catalog')).catalog;
    assert.equal(cat.buildings.length, 47);
    console.log('✓ каталог: зданий', cat.buildings.length);

    a.send({ t: 'register', login: 'Webby', password: 'pass1', race: '1' });
    await a.expect('registered');
    a.send({ t: 'login', login: 'webby', password: 'wrong' });
    await a.expect('error', (m) => /Неверный/.test(m.msg));
    a.send({ t: 'login', login: 'webby', password: 'pass1' });
    await a.expect('auth');
    const st = await a.expect('state');
    assert.equal(st.user.race, 'elves');
    assert.equal(st.castle.grid[0][24], 0); // Ратуша в центре 7×7
    console.log('✓ регистрация, вход, состояние замка');

    a.send({ t: 'build', view: 0, cell: 25, building: 1 });
    const s2 = await a.expect('state', (m) => m.castle.queue.length === 1);
    assert.equal(s2.castle.queue[0].building, 1);
    await a.expect('toast', (m) => /Готово/.test(m.msg));
    const s3 = await a.expect('state', (m) => m.castle.grid[0][25] === 1);
    assert.equal(s3.castle.levels[0][25], 1);
    console.log('✓ стройка Склада завершилась');

    a.send({ t: 'build', view: 1, cell: 0, building: 5 }); // (0,0) — земля, Огород не положен? проверяем, что сервер решает сам
    const r = await Promise.race([a.expect('error'), a.expect('state', (m) => m.castle.queue.length === 1)]);
    console.log('✓ стройка на землях проверяется сервером:', r.t === 'error' ? r.msg : 'разрешено');

    a.send({ t: 'world' });
    const w = await a.expect('world');
    assert.ok(w.objects.some((o) => o.kind === 'castle' && o.owner === 'webby'));
    console.log('✓ карта мира, объектов:', w.objects.length);

    await b.open();
    b.send({ t: 'register', login: 'Second', password: 'pass2', race: '0' });
    await b.expect('registered');
    b.send({ t: 'login', login: 'second', password: 'pass2' });
    await b.expect('auth');
    b.send({ t: 'sendmail', to: 'webby', subject: 'Привет', text: 'Из браузера' });
    await a.expect('toast', (m) => /Новое письмо/.test(m.msg));
    a.send({ t: 'mail', folder: 0 });
    const mail = await a.expect('mail');
    a.send({ t: 'read', id: mail.list[0].id });
    assert.equal((await a.expect('letter')).letter.text, 'Из браузера');
    console.log('✓ почта между игроками');

    a.send({ t: 'rating' });
    const rows = (await a.expect('rating')).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[0].login, 'admin'); // админ на полной прокачке — первый
    a.send({ t: 'profile', id: 0 });
    assert.equal((await a.expect('profile')).profile.login, 'webby');
    console.log('✓ рейтинг и кабинет');

    // ---- админ, армия, бой, функции зданий ----
    const adm = client(); await adm.open();
    adm.send({ t: 'hello' }); const mil = (await adm.expect('catalog')).catalog.mil;
    assert.ok(mil.units.length >= 30 && mil.units.some((u) => u.name === 'Генерал'));
    adm.send({ t: 'login', login: 'admin', password: 'admin' });
    await adm.expect('auth');
    let as = await adm.expect('state');
    assert.ok(as.castle.mil.admin && as.castle.mil.general.level === 100 && as.castle.mil.units[200] >= 1000);
    assert.equal(as.castle.levels[0][24], 20);
    console.log('✓ админ: полная прокачка, генерал 100 ур., войска', Object.keys(as.castle.mil.units).length, 'видов');

    adm.send({ t: 'train', unit: 200, count: 3 });
    await adm.expect('toast', (m) => /Готово: Мечник ×3/.test(m.msg));
    adm.send({ t: 'train', unit: 200, count: 1000 });
    await adm.expect('error', (m) => /За сутки можно обучить не больше 400/.test(m.msg));
    console.log('✓ тренировка в Казарме, лимит 400 воинов в сутки');

    const target = s3.castle;
    adm.send({ t: 'send', units: { 200: 50, 202: 5 }, general: true, x: target.x, y: target.y, mission: 'raid' });
    await adm.expect('toast', (m) => /Армия выступила/.test(m.msg));
    adm.send({ t: 'admin', op: 'finish' });
    await adm.expect('toast', (m) => /Набег: Замок webby/.test(m.msg));
    await a.expect('toast', (m) => /напал admin/.test(m.msg));
    adm.send({ t: 'reports' });
    const reps = (await adm.expect('reports')).list;
    adm.send({ t: 'report', id: reps.find((x) => /Набег/.test(x.title)).id });
    const rep = (await adm.expect('report')).report;
    assert.ok(rep.lines.some((l) => /Добыча/.test(l)));
    console.log('✓ набег на игрока с генералом, отчёты у обеих сторон:', rep.lines[4]);

    adm.send({ t: 'exchange', from: 'wood', to: 'iron', amount: 1000 });
    await adm.expect('toast', (m) => /Обмен/.test(m.msg));
    adm.send({ t: 'alliance', op: 'create', name: 'Короли', tag: 'KRL' });
    adm.send({ t: 'alliances' });
    assert.equal((await adm.expect('alliances')).list[0].tag, 'KRL');
    b.send({ t: 'send', units: {}, x: 1, y: 1, mission: 'attack' }); // у «a» висит ожидание любой ошибки из Promise.race выше
    await b.expect('error', (m) => /Военный штаб/.test(m.msg));
    console.log('✓ рынок, альянс, проверки миссий');

    // ---- Дипломатический центр: приглашение, принятие, исключение, заявка и одобрение ----
    adm.send({ t: 'admin', op: 'max', login: 'webby', all: true });
    await a.expect('state', (m) => m.castle.grid[0].includes(13));
    adm.send({ t: 'alliance', op: 'invite', login: 'webby' });
    await adm.expect('toast', (m) => /Приглашение отправлено: webby/.test(m.msg));
    const inv = (await a.expect('state', (m) => (m.castle.mil.invites || []).length === 1)).castle.mil.invites[0];
    assert.equal(inv.tag, 'KRL');
    a.send({ t: 'alliance', op: 'accept', id: inv.id });
    await a.expect('state', (m) => m.castle.mil.alliance && m.castle.mil.alliance.tag === 'KRL' && !m.castle.mil.invites.length);
    adm.send({ t: 'alliance', op: 'kick', login: 'webby' });
    await a.expect('state', (m) => !m.castle.mil.alliance);
    a.send({ t: 'alliance', op: 'request', id: inv.id });
    await a.expect('toast', (m) => /Заявка отправлена в \[KRL\]/.test(m.msg));
    adm.send({ t: 'sync' });
    const rq = (await adm.expect('state', (m) => m.castle.mil.alliance && m.castle.mil.alliance.requests.length === 1)).castle.mil.alliance.requests[0];
    adm.send({ t: 'alliance', op: 'approve', id: rq.id });
    await a.expect('state', (m) => m.castle.mil.alliance && m.castle.mil.alliance.tag === 'KRL');
    adm.send({ t: 'ratings', kind: 'alliances' });
    { const rl = (await adm.expect('ratings', (m) => m.kind === 'alliances')).list.find((x) => x.tag === 'KRL');
      adm.send({ t: 'sync' }); const st = (await adm.expect('state', (m) => m.castle.mil.alliance && m.castle.mil.alliance.info.length === 2)).castle.mil.alliance;
      assert.equal(rl.rating, st.info.reduce((q, u) => q + u.rating + u.rep, 0)); }
    adm.send({ t: 'alliance', op: 'award', login: 'webby', kind: 'gold', text: 'За оборону' });
    await adm.expect('toast', (m) => /Медаль вручена: webby/.test(m.msg));
    adm.send({ t: 'profile', id: s3.user.id });
    { const pr = (await adm.expect('profile', (m) => (m.profile.awards || []).length > 0)).profile; assert.equal(pr.awards[0].tag, 'KRL'); }
    // окно «Альянс»: права, описание, форум, новости, казна, логи
    adm.send({ t: 'ally', op: 'rank', login: 'webby', title: 'Казначей', ep: 2, rights: ['treasury', 'logs'] });
    await adm.expect('toast', (m) => /Права назначены: webby/.test(m.msg));
    adm.send({ t: 'ally', op: 'desc', tag: 'KRL', name: 'Короли Мира', desc: 'Лучший альянс' });
    await adm.expect('toast', (m) => /Описание изменено/.test(m.msg));
    a.send({ t: 'ally', op: 'topic', title: 'Сбор', text: 'Все на штурм' });
    const tp = (await a.expect('allytopic')).data; assert.equal(tp.posts[0].text, 'Все на штурм');
    adm.send({ t: 'ally', op: 'post', topic: tp.id, text: 'Иду' });
    await adm.expect('toast', (m) => /Сообщение добавлено/.test(m.msg));
    adm.send({ t: 'ally', op: 'gold', n: 100 });
    await adm.expect('toast', (m) => /Внесено в казну: 100/.test(m.msg));
    a.send({ t: 'ally', op: 'gold', n: 40, to: 'webby' });
    await a.expect('toast', (m) => /Выдано 40 золота: webby/.test(m.msg));
    adm.send({ t: 'ally', op: 'get' });
    const av = (await adm.expect('ally', (m) => m.data.treasury === 60)).data;
    assert.ok(av.name === 'Короли Мира' && av.members.find((x) => x.login === 'webby').title === 'Казначей' && av.forum[0].replies === 2 && av.log.length > 0);
    console.log('✓ окно альянса: права, описание, форум, казна, логи');
    console.log('✓ Дипломатический центр: приглашения, исключение, заявка и одобрение');

    // ---- Центр разведки: разведчики тренируются в нём, отчёт зависит от уровня и выживших ----
    assert.ok(mil.units.find((u) => u.id === 202).building === 45 && mil.units.some((u) => u.name === 'Орк загонщик'));
    assert.ok(mil.spyOpen && mil.spyOpen.reinf.level > mil.spyOpen.armies.level);
    adm.send({ t: 'admin', op: 'noarmy', login: 'webby', all: true }); // без охраны — выживут все, видно всё
    adm.send({ t: 'send', units: { 202: 300 }, x: target.x, y: target.y, mission: 'scout' });
    await adm.expect('toast', (m) => /Армия выступила: Разведка/.test(m.msg));
    adm.send({ t: 'admin', op: 'finish' });
    await adm.expect('toast', (m) => /Разведка/.test(m.msg) && !/выступила/.test(m.msg));
    adm.send({ t: 'reports' });
    const srep = (await adm.expect('reports')).list.find((x) => /^Разведка/.test(x.title));
    adm.send({ t: 'report', id: srep.id });
    const sl = (await adm.expect('report')).report.lines;
    assert.ok(sl.some((l) => /Выжило разведчиков: 100%/.test(l)) && sl.some((l) => /^Подкрепления/.test(l)) && sl.some((l) => /^Здания/.test(l)), sl.join('\n'));
    console.log('✓ Центр разведки:', sl[1]);

    // ---- Караульная башня: оповещение о набеге (не о разведке), «Передвижения армий» ----
    adm.send({ t: 'send', units: { 200: 10 }, x: target.x, y: target.y, mission: 'raid' });
    await a.expect('toast', (m) => /Караульная башня: Набег на/.test(m.msg));
    a.send({ t: 'moves' });
    const mv = (await a.expect('moves')).data;
    assert.ok(mv.incoming.some((x) => x.mission === 'raid' && x.from === 'admin'));
    adm.send({ t: 'admin', op: 'finish' });
    await adm.expect('toast', (m) => /Набег: /.test(m.msg));
    console.log('✓ Караульная башня: оповещение о набеге, передвижения армий королевства');

    // ---- склад как в оригинале, «Разрушить» ----
    adm.send({ t: 'sync' });
    let ds = (await adm.expect('state')).castle;
    assert.equal(ds.cap.wood, 70200); // 14 складов (6 клеток — тропинка)
    const storeCell = ds.grid[0].indexOf(1);
    adm.send({ t: 'demolish', view: 0, cell: storeCell });
    await adm.expect('toast', (m) => /Здание разрушено: Склад/.test(m.msg));
    ds = (await adm.expect('state', (m) => m.castle.grid[0][storeCell] === -1)).castle;
    assert.equal(ds.cap.wood, 65200);
    adm.send({ t: 'build', view: 0, cell: storeCell, building: 25 }); // второй Храм нельзя — повторяться может только Склад
    await adm.expect('error', (m) => /Такое здание уже есть/.test(m.msg));
    adm.send({ t: 'demolish', view: 0, cell: ds.grid[0].indexOf(0) });
    await adm.expect('error', (m) => /Ратушу разрушить нельзя/.test(m.msg));
    adm.send({ t: 'admin', op: 'max' });
    await adm.expect('state', (m) => m.castle.cap.wood === 70200);
    adm.send({ t: 'demolish', view: 0, cell: 3 });
    await adm.expect('error', (m) => /Здесь нет здания/.test(m.msg));
    adm.send({ t: 'build', view: 0, cell: 3, building: 1 });
    await adm.expect('error', (m) => /На тропинке строить нельзя/.test(m.msg));
    console.log('✓ склады: 14 × 5000 + 200 = 70 200, «Разрушить»');

    // ---- аватар: только пиксели 96×96, PNG собирает сервер; мусор и шелл отклоняются ----
    const px = Buffer.alloc(96 * 96 * 4); for (let i = 0; i < px.length; i += 4) { px[i] = 200; px[i + 1] = 30; px[i + 3] = 255; }
    adm.send({ t: 'avatar', op: 'set', px: px.toString('base64') });
    const prof = (await adm.expect('profile', (m) => m.refresh)).profile;
    assert.ok(prof.avatar > 0);
    const pr = await fetch(`http://127.0.0.1:${WEB_PORT}/avatar/${prof.id}.png`), png = Buffer.from(await pr.arrayBuffer());
    assert.equal(pr.headers.get('content-type'), 'image/png'); assert.equal(pr.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    adm.send({ t: 'avatar', op: 'set', px: Buffer.from('<?php system($_GET[1]); ?>').toString('base64') });
    await adm.expect('error', (m) => /96×96|Неверные/.test(m.msg));
    adm.send({ t: 'avatar', op: 'set', px: '../../etc/passwd' });
    await adm.expect('error', (m) => /Неверные данные/.test(m.msg));
    assert.equal((await fetch(`http://127.0.0.1:${WEB_PORT}/avatar/..%2F..%2Fpackage.json`)).status, 404);
    console.log('✓ аватар: PNG собирает сервер, чужие файлы и пути отклоняются');

    // ---- Резиденция: лояльность населения и праздники ----
    adm.send({ t: 'festival', id: 'feast' });
    await adm.expect('toast', (m) => /Королевский пир: лояльность населения/.test(m.msg));
    const rv = (await adm.expect('state', (m) => m.castle.mil.royal && m.castle.mil.royal.festivals.some((f) => f.id === 'feast' && !f.ready))).castle.mil.royal;
    assert.ok(rv.royal > 0 && rv.need === 13500 * rv.castles);
    adm.send({ t: 'festival', id: 'feast' });
    await adm.expect('error', (m) => /уже был сегодня/.test(m.msg));
    adm.send({ t: 'ritual', id: 'mystery' });
    await adm.expect('toast', (m) => /Великое таинство: бонус лояльности \+20%/.test(m.msg));
    adm.send({ t: 'ritual', id: 'mystery' });
    await adm.expect('error', (m) => /ещё действует/.test(m.msg));
    console.log('✓ Резиденция: лояльность населения', rv.royal, '· следующий замок', rv.need, '· праздники раз в сутки');

    // ---- Кузница: улучшение атаки/защиты юнита, +1 к базе за уровень ----
    adm.send({ t: 'admin', op: 'max' });
    let fs0 = (await adm.expect('state', (m) => m.castle.mil.forge && m.castle.mil.forge[200] && m.castle.mil.forge[200].a === 20)).castle.mil;
    assert.ok(fs0.forgeUnits.some((u) => u.id === 240));
    adm.send({ t: 'forge', unit: 200, kind: 'a' });
    await adm.expect('error', (m) => /Достигнут максимум/.test(m.msg));
    adm.send({ t: 'forge', unit: 221, kind: 'a' });
    await adm.expect('error', (m) => /нельзя улучшить/.test(m.msg));
    console.log('✓ Кузница: улучшения 20/20, торговца улучшить нельзя');

    // ---- подарки: админ дарит «Большой диамант» игроку webby, подарок виден в профиле ----
    adm.send({ t: 'gift', to: s3.user.id, gift: 'diamond', text: 'Удачи!' });
    await adm.expect('toast', (m) => /Подарок «Большой диамант» отправлен игроку webby/.test(m.msg));
    const gp = (await adm.expect('profile', (m) => m.refresh)).profile;
    assert.ok(gp.gifts[0].gift === 'diamond' && gp.gifts[0].from === 'admin' && gp.gifts[0].text === 'Удачи!');
    adm.send({ t: 'gift', to: as.user.id, gift: 'diamond' }); // себе — тоже можно
    await adm.expect('toast', (m) => /отправлен игроку admin/.test(m.msg));
    adm.send({ t: 'rep', id: s3.user.id, coins: 50 });
    await adm.expect('toast', (m) => /Репутация \+100/.test(m.msg));
    console.log('✓ репутация за золото: 50 монет = +100');
    console.log('✓ подарки: «Большой диамант» за 3 золота виден в профиле получателя');

    // ---- Зал Славы: соревновательный месяц, награды топ-3 с датой ----
    adm.send({ t: 'halls' });
    const hl = await adm.expect('halls');
    assert.ok(hl.season && hl.season.end > Date.now());
    adm.send({ t: 'admin', op: 'season' });
    await adm.expect('toast', (m) => /Месяц подведён досрочно/.test(m.msg));
    adm.send({ t: 'profile', id: s3.user.id });
    const aw = (await adm.expect('profile', (m) => m.profile.medals.length > 0)).profile.medals;
    assert.ok(aw.length > 0 && aw[0].at > 0 && aw[0].month, JSON.stringify(hl.list.map((h) => h.top)) + ' id ' + s3.user.id);
    console.log('✓ Зал Славы: итоги месяца, награды топ-3 с датой получения:', aw.map((m) => `${m.name} ${m.place}`).join(', '));

    // ---- модератор форума: удаление сообщений и бан в чате ----
    adm.send({ t: 'admin', op: 'mod', login: 'webby' });
    await adm.expect('toast', (m) => /webby — модератор форума/.test(m.msg));
    adm.send({ t: 'register', login: 'spammer', password: '123', race: 0 });
    const sp = client(); await sp.open(); sp.send({ t: 'login', login: 'spammer', password: '123' }); await sp.expect('state');
    sp.send({ t: 'chat', text: 'СПАМ' });
    const spm = (await a.expect('chatmsg', (m) => m.msg.text === 'СПАМ')).msg;
    a.send({ t: 'chatmod', op: 'del', id: spm.id });
    await sp.expect('chatdel', (m) => m.id === spm.id);
    a.send({ t: 'chatmod', op: 'ban', login: 'spammer', hours: 2 });
    await a.expect('toast', (m) => /spammer: бан в чате на 2 ч/.test(m.msg));
    sp.send({ t: 'chat', text: 'ещё' });
    await sp.expect('error', (m) => /запрещено писать в чат/.test(m.msg));
    adm.send({ t: 'chatmod', op: 'ban', login: 'admin', hours: -1 });
    await adm.expect('error', (m) => /забанить нельзя/.test(m.msg));
    sp.close();
    // модератор удаляет сообщение в форуме альянса (права «Новости и форум» у него нет) и может открыть форум чужого альянса
    adm.send({ t: 'ally', op: 'get' });
    const fa = (await adm.expect('ally', (m) => m.data.forum.length > 0)).data, ftopic = fa.forum[0];
    a.send({ t: 'ally', op: 'postdel', topic: ftopic.id, idx: 1 });
    await a.expect('toast', (m) => /Сообщение удалено/.test(m.msg));
    a.send({ t: 'ally', op: 'topicop', topic: ftopic.id, act: 'delete' });
    await a.expect('toast', (m) => /Готово/.test(m.msg));
    console.log('✓ модератор форума: удаление сообщения, бан в чате на 2 ч, админа забанить нельзя');

    // ---- казна: админ выдаёт монеты — игроку письмо «Ваша казна пополнена 50 монетами», история трат ----
    adm.send({ t: 'admin', op: 'gold', login: 'webby', n: 50 });
    await a.expect('toast', (m) => /Ваша казна пополнена 50 монетами/.test(m.msg));
    const gl = (await a.expect('state', (m) => (m.user.goldLog || []).some((x) => x.delta === 50))).user.goldLog;
    assert.ok(gl[0].reason === 'Пополнение казны администрацией' && gl.some((x) => /казны альянса/.test(x.reason)), JSON.stringify(gl));
    a.send({ t: 'mail', folder: 'in' });
    const mb = await a.expect('mail');
    assert.ok(mb.list.some((x) => x.subject === 'Казна пополнена' && x.other === 'admin'));
    console.log('✓ казна: пополнение админом, письмо игроку, история трат');

    // ---- мульты: два аккаунта с одного устройства попадают в одну группу ----
    for (const lg of ['multa', 'multb']) {
      const c = client(); await c.open();
      c.send({ t: 'register', login: lg, password: '123', race: 0, dev: 'abcdef0123456789abcdef01' });
      await c.expect('registered');
      c.send({ t: 'login', login: lg, password: '123', dev: 'abcdef0123456789abcdef01' }); await c.expect('state'); c.close();
    }
    adm.send({ t: 'admin', op: 'multis' });
    const mg = (await adm.expect('admininfo', (m) => m.op === 'multis')).data;
    assert.ok(mg.some((g) => g.strong && ['multa', 'multb'].every((l) => g.users.some((u) => u.login === l))), JSON.stringify(mg));
    console.log('✓ мульты: общее устройство найдено, группы по IP');

    // ---- премиум: покупка за монеты, звание VIP ----
    adm.send({ t: 'admin', op: 'gold', login: 'webby', n: 150 });
    await a.expect('toast', (m) => /пополнена 150/.test(m.msg));
    a.send({ t: 'premium', days: 30 });
    await a.expect('toast', (m) => /Премиум активен до/.test(m.msg));
    a.send({ t: 'profile', id: s3.user.id });
    const pv = (await a.expect('profile', (m) => m.profile.premium > 0)).profile; // webby — модератор, поэтому звание «Модератор форума»
    assert.ok(pv.premium > Date.now() + 29 * 86400000);
    console.log('✓ премиум: куплен за 150 монет на 30 дней, премиум в профиле');

    // ---- генерал: очки опыта, распределение, сброс, имя, убить ----
    adm.send({ t: 'admin', op: 'general', level: 50 });
    let gs = (await adm.expect('state', (m) => m.castle.mil.general && m.castle.mil.general.level === 50)).castle.mil.general;
    assert.equal(gs.free, 98); assert.ok(gs.stats && gs.where.includes('Замковая армия'));
    adm.send({ t: 'general', op: 'dist', pts: { catk: 60, def: 10 } });
    gs = (await adm.expect('state', (m) => m.castle.mil.general.free === 28)).castle.mil.general;
    assert.ok(Math.abs(gs.stats.catk - 0.18) < 1e-9 && gs.pts.def === 10);
    adm.send({ t: 'general', op: 'dist', pts: { atk: 999 } });
    await adm.expect('error', (m) => /Свободных очков только 28/.test(m.msg));
    adm.send({ t: 'general', op: 'reset' });
    gs = (await adm.expect('state', (m) => m.castle.mil.general.free === 98)).castle.mil.general;
    assert.equal(gs.resets, 0);
    adm.send({ t: 'general', op: 'rename', name: 'Решала' });
    await adm.expect('state', (m) => m.castle.mil.general.name === 'Решала');
    adm.send({ t: 'general', op: 'kill' });
    await adm.expect('state', (m) => m.castle.mil.general === null);
    adm.send({ t: 'admin', op: 'general', level: 100 });
    const g100 = (await adm.expect('state', (m) => m.castle.mil.general && m.castle.mil.general.level === 100)).castle.mil.general;
    adm.send({ t: 'admin', op: 'general', level: 900 });
    const g500 = (await adm.expect('state', (m) => m.castle.mil.general && m.castle.mil.general.level === 500)).castle.mil.general;
    assert.equal(g500.reviveCost.iron, g100.reviveCost.iron * 5); // уровень 500 — максимум, воскрешение в 5 раз дороже, чем на 100
    console.log('✓ генерал: очки опыта, распределение, сброс, имя, убить');

    // ---- армии в замке, военный поход, подкрепление ----
    adm.send({ t: 'squad', op: 'regroup', from: 'castle', to: 'new', units: { 200: 100 } });
    let st2 = await adm.expect('state', (m) => (m.castle.mil.squads || []).length === 1);
    const sq = st2.castle.mil.squads[0];
    adm.send({ t: 'squad', op: 'rename', id: sq.id, name: 'Гвардия' });
    await adm.expect('state', (m) => m.castle.mil.squads[0] && m.castle.mil.squads[0].name === 'Гвардия');
    adm.send({ t: 'send', from: sq.id, mission: 'reinforce', x: target.x, y: target.y });
    await adm.expect('toast', (m) => /Армия выступила: Подкрепление/.test(m.msg));
    adm.send({ t: 'admin', op: 'finish' });
    st2 = await adm.expect('state', (m) => m.castle.mil.armies.some((a) => a.state === 'stay'));
    const stay = st2.castle.mil.armies.find((a) => a.state === 'stay');
    adm.send({ t: 'squad', op: 'recall', id: stay.id });
    adm.send({ t: 'admin', op: 'finish' });
    await adm.expect('state', (m) => (m.castle.mil.squads || []).some((q) => q.name === 'Гвардия') && !m.castle.mil.armies.length);
    adm.send({ t: 'send', from: 'castle', mission: 'raid', x: target.x, y: target.y, at: Date.now() + 3600000 });
    await adm.expect('toast', (m) => /Поход запланирован/.test(m.msg));
    console.log('✓ армии в замке: отряд, переименование, подкрепление и отзыв, поход по расписанию');
    adm.close();
    console.log('\nВЕБ: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    a.close(); b.close();
    server.kill();
    fs.rmSync(DB, { force: true });
  }
})();
