export const names = ['出发', '梧桐小巷', '甜品街', '机会', '花园洋房', '咖啡里', '度假', '滨江步道', '艺术工坊', '税务局', '音乐街', '旧书坊', '停车场', '星光影院', '设计街', '机会', '海派公馆', '剧场里', '休息站', '云端餐厅', '外滩大道', '税务局', '金融中心', '天空之城'];
export const icons = ['🚩', '🌳', '🍰', '✦', '🏡', '☕', '🏝️', '🌊', '🎨', '🧾', '🎷', '📚', '🅿', '🎬', '✏️', '✦', '🏛️', '🎭', '💤', '🍽️', '🌉', '🧾', '🏦', '🏙️'];
export const special = [0, 3, 6, 9, 12, 15, 18, 21];
export const price = (i) => 180 + Math.floor(i / 3) * 70;
export function person(name, token, bot = false) { return { name, token, bot, cash: 2400, pos: 0, out: false, skip: 0 }; }
export function addLog(s, msg) { s.log = [msg, ...s.log].slice(0, 35); }
export function worth(s, p) { return s.players[p].cash + s.land.reduce((v, l, i) => v + (l?.owner === p ? price(i) + l.level * Math.floor(price(i) * .6) : 0), 0); }
export function finish(s) { const alive = s.players.filter((p) => !p.out); if (alive.length <= 1 || s.turns >= s.players.length * 20) {
    s.status = 'finished';
    s.winner = s.players.map((p, i) => ({ i, w: p.out ? -1 : worth(s, i) })).sort((a, b) => b.w - a.w)[0].i;
    addLog(s, `本局结束！${s.players[s.winner].name}获得胜利`);
} }
export function next(s) { s.turns++; finish(s); if (s.status === 'finished')
    return; do {
    s.current = (s.current + 1) % s.players.length;
} while (s.players[s.current].out); s.phase = 'roll'; s.deadline = Date.now() + 60000; }
function pay(s, from, amount, to) { const p = s.players[from]; const paid = Math.min(p.cash, amount); p.cash -= paid; if (to !== undefined)
    s.players[to].cash += paid; if (paid < amount) {
    p.out = true;
    s.land = s.land.map((l) => l?.owner === from ? null : l);
    addLog(s, p.name + '资金不足，破产退场');
} }
export function roll(s) { const p = s.players[s.current]; if (p.skip) {
    p.skip = 0;
    addLog(s, p.name + '休息一回合');
    next(s);
    return;
} s.dice = 1 + crypto.getRandomValues(new Uint32Array(1))[0] % 6; const old = p.pos; p.pos = (old + s.dice) % 24; if (old + s.dice >= 24) {
    p.cash += 400;
    addLog(s, p.name + '经过起点，领取400');
} addLog(s, `${p.name}掷出${s.dice}点，抵达${names[p.pos]}`); const i = p.pos; if (!special.includes(i)) {
    const l = s.land[i];
    if (!l) {
        s.phase = 'buy';
        return;
    }
    if (l.owner === s.current) {
        if (l.level < 3) {
            s.phase = 'upgrade';
            return;
        }
    }
    else {
        const rent = Math.floor(price(i) * .28) * (l.level + 1);
        pay(s, s.current, rent, l.owner);
        addLog(s, `${p.name}向${s.players[l.owner].name}支付租金${rent}`);
    }
}
else if (i === 3 || i === 15) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 4;
    if (n === 0) {
        p.cash += 350;
        addLog(s, '机会：收到派对奖金 +350');
    }
    if (n === 1) {
        pay(s, s.current, 180);
        addLog(s, '机会：维修账单 -180');
    }
    if (n === 2) {
        p.cash += 200;
        addLog(s, '机会：投资分红 +200');
    }
    if (n === 3) {
        p.skip = 1;
        addLog(s, '机会：度假券，下回合休息');
    }
}
else if (i === 9 || i === 21) {
    pay(s, s.current, 150);
    addLog(s, '缴纳城市税金150');
}
else if (i === 6) {
    p.cash += 100;
    addLog(s, '度假补贴 +100');
}
else if (i === 18) {
    p.skip = 1;
    addLog(s, '休息站：下回合暂停一次');
} next(s); }
export function decide(s, yes) { const p = s.players[s.current], i = p.pos, cost = s.phase === 'buy' ? price(i) : Math.floor(price(i) * .6); if (yes) {
    if (p.cash < cost)
        throw Error('现金不足，可以选择跳过');
    p.cash -= cost;
    if (s.phase === 'buy') {
        s.land[i] = { owner: s.current, level: 0 };
        addLog(s, p.name + '买下' + names[i]);
    }
    else {
        s.land[i].level++;
        addLog(s, p.name + '升级了' + names[i]);
    }
} next(s); }
export function automatic(s) { if (s.status !== 'playing')
    return; const p = s.players[s.current]; if (!p.bot && Date.now() < s.deadline)
    return; if (s.phase === 'roll')
    roll(s);
else
    decide(s, p.bot && p.cash > (s.phase === 'buy' ? price(p.pos) : Math.floor(price(p.pos) * .6)) + 350); }
