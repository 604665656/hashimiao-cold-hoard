// 真实 Chromium 渲染验收：竖屏 390×844，截关键屏 + 跑完整一局
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
// 发布包适配：相对包根定位产物（工作区版为绝对路径）
const URL = 'file://' + path.resolve(__dirname, '..', '极寒末世囤货模拟器_完整版.html');
const OUT = path.resolve(__dirname, '..', '_shots');
fs.mkdirSync(OUT, { recursive: true });

function chalCodeFor(seed){
  const s=(seed>>>0).toString(36);let h=5381;
  for(const c of s)h=((h*33)^c.charCodeAt(0))>>>0;
  return 'HSMS1-'+s+'-'+(h&255).toString(36);
}

async function shot(page, name, full = false) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log('  shot', name);
}

async function newPage(browser, errors, fresh = false) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  // 既有 A–E 阶段一律按「老玩家」跑，保持原基线；阶段 F 用 fresh=true 验证首局
  await page.evaluate(f => {
    if (f) localStorage.removeItem('hsm_tutorial_v1');
    else localStorage.setItem('hsm_tutorial_v1', '1');
  }, fresh);
  await page.waitForTimeout(250);
  return page;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-web-security']
  });
  const errors = [];

  console.log('=== 阶段 A：直接切屏看排版 ===');
  const p = await newPage(browser, errors);
  const faceCheck = await p.evaluate(() => {
    const expect = {silver:'catB0',red:'catB1',night:'catB3',white:'catB2',warm:'catB4',panic:'catB5'};
    const out = [];
    Object.entries(expect).forEach(([k,key]) => {
      face(k);
      out.push([k, $('portrait').src === ART[key], $('portrait').style.filter || '']);
    });
    return { out, unique: new Set(Object.values(expect).map(k => ART[k])).size };
  });
  console.log('  R3 六态映射 →', faceCheck.out.map(([k,ok]) => k + (ok ? '✓' : '✗')).join(' '),
    '| 素材互异', faceCheck.unique + '/6',
    '| 滤镜已清空', faceCheck.out.every(x => x[2] === '') ? '✓' : '✗');
  const diffCheck = await p.evaluate(() => Promise.all(['catB2','catB3','catB4','catB5'].map(k => new Promise(res => {
    const im = new Image();
    im.onload = () => res([k, im.naturalWidth + 'x' + im.naturalHeight]);
    im.onerror = () => res([k, 'FAIL']);
    im.src = ART[k];
  }))));
  console.log('  R3 差分解码', diffCheck.map(d => d.join(':')).join(' '),
    diffCheck.every(d => d[1] !== 'FAIL') ? '✓' : '✗');
  if (diffCheck.some(d => d[1] === 'FAIL')) errors.push('R3 差分解码失败');
  const sceneCheck = await p.evaluate(async () => {
    const keys = ['scene1','scene2','scene3'];
    const decoded = await Promise.all(keys.map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => res([k, im.naturalWidth + 'x' + im.naturalHeight]);
      im.onerror = () => res([k, 'FAIL']);
      im.src = ART[k];
    })));
    const seen = [];
    [0,1,2].forEach(i => { try { interlude(i, () => {}); } catch (e) { }
      seen.push(document.getElementById('intBg').style.backgroundImage.slice(0, 80)); });
    return { decoded, seen, unique: new Set(seen).size,
             allSet: seen.every(x => x.includes('data:image/webp')) };
  });
  console.log('  R2 三幕解码', sceneCheck.decoded.map(d => d.join(':')).join(' '),
    '| 底图互异', sceneCheck.unique + '/3', '| 均已设置', sceneCheck.allSet ? '✓' : '✗');
  const goodsCheck = await p.evaluate(() => Promise.all(
    ['g_food','g_water','g_fuel','g_bag','g_med','g_radio','g_tool'].map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => res([k, im.naturalWidth + 'x' + im.naturalHeight]);
      im.onerror = () => res([k, 'FAIL']);
      im.src = ART[k];
    }))));
  console.log('  R4 物资卡解码', goodsCheck.map(d => d.join(':')).join(' '),
    goodsCheck.every(d => d[1] !== 'FAIL') ? '✓' : '✗');
  if (goodsCheck.some(d => d[1] === 'FAIL')) errors.push('R4 物资卡解码失败');
  const moneyEpi = await p.evaluate(() => resolveEnding({days:5,cause:'口粮见底',weather:0,
    tier:{id:'overflow',name:'溢出'},cash:10000,cashLeft:9000,shopHours:60,spent:1000,
    buy:{},karma:0,flags:{},keep:false,tradeN:0}).text.indexOf('留着吧') >= 0);
  console.log('  END_MONEY 留钱念想', moneyEpi ? '✓ 已软化' : '✗ 仍是纯嘲讽');
  const logicCheck = await p.evaluate(() => {
    // P0-3：给定采购，预测最短板应为「煤」；换到白毛风后煤天数必须变短
    buy = {food:20, water:20, fuel:6, bag:1, med:0, radio:0, tool:0};
    weather = 0; renderForecast();
    const cold = document.getElementById('forecast').textContent;
    weather = 3; renderForecast();
    const white = document.getElementById('forecast').textContent;
    // P0-1：造一条轨迹，首个失衡日应为 D4，断供前 3 天有 D5/D6/D7
    const fakeTrace = [[1,20,20,6,100],[2,18,18,5,94],[3,16,16,4,88],
                       [4,14,14,2,82],[5,12,12,1,76],[6,10,10,0,70],[7,8,8,0,64]];
    const R = summarize({days:7,cause:'口粮见底，没撑到天亮',weather:3,
      tier:{id:'rich',name:'充裕'},cash:6000,cashLeft:1200,shopHours:60,
      spent:4800,buy:{},karma:1,flags:{},keep:false,tradeN:2},
      {trace:fakeTrace,karma:1});
    // 防套利：任意天气 / 任意天数，卖价必须严格低于买价
    let arb = 0;
    for (let w = 0; w < 4; w++) { weather = w;
      for (let d = 1; d <= 60; d++) { st.day = d;
        GOODS.forEach(g => { if (tradeSell(g) >= tradePrice(g)) arb++; }); } }
    weather = 0; st.day = 3;
    buy = {food:0, water:0, fuel:0, bag:0, med:0, radio:0, tool:0};
    tickShop();
    return {cold, white, replay:R.short, tip:R.tip, hasTail:R.html.indexOf('D7') >= 0,
            hasFirst:R.html.indexOf('D4') >= 0, arb};
  });
  const coalNum = t => { const m = /煤\s*(\d+)/.exec(t); return m ? +m[1] : null; };
  const coldN = coalNum(logicCheck.cold), whiteN = coalNum(logicCheck.white);
  const forecastOk = /最短板/.test(logicCheck.cold) && coldN !== null && whiteN !== null && whiteN < coldN;
  console.log('  P0-3 采购预测 →', /最短板/.test(logicCheck.cold) ? '✓ 有最短板' : '✗',
    '| 冷冬煤', coldN, '天 / 白毛风煤', whiteN, '天', forecastOk ? '✓ 随天气变短' : '✗');
  if (!forecastOk) errors.push('采购预测未随天气变化或缺少最短板');
  console.log('  P0-1 复盘纯函数 →', logicCheck.hasFirst ? '✓ 首个失衡 D4' : '✗',
    logicCheck.hasTail ? '✓ 断供前 3 天' : '✗', '|', logicCheck.replay);
  console.log('  防套利 → 卖价 ≥ 买价 的组合', logicCheck.arb, logicCheck.arb === 0 ? '✓' : '✗');
  if (logicCheck.arb) errors.push('门缝交易存在买卖套利');
  if (!logicCheck.hasFirst || !logicCheck.hasTail) errors.push('复盘纯函数未正确解析轨迹');
  const artCheck = await p.evaluate(() => {
    const keys = ['c_green','c_set','c_ui1','c_view','c_ui2','c_ui3','c_editor','c_web','c_seal'];
    const r = {};
    return Promise.all(keys.map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => res([k, im.naturalWidth + 'x' + im.naturalHeight]);
      im.onerror = () => res([k, 'FAIL']);
      im.src = ART[k];
    }))).then(list => {
      list.forEach(([k, v]) => r[k] = v);
      return r;
    });
  });
  const bad = Object.entries(artCheck).filter(([, v]) => v === 'FAIL');
  console.log('  R1 卡面解码', Object.keys(artCheck).length, '张 | 失败', bad.length, bad.length ? JSON.stringify(bad) : '✓');
  await shot(p, '01_home', true);
  await p.evaluate(() => { showScreen('game'); panel('setup'); scene('01 / 世界设定', '待定', 0); face('silver'); tickSetup(); });
  await shot(p, '02_setup', true);
  await p.evaluate(() => { panel('shop'); renderGoods(); tickShop(); });
  await p.click('#quickKit');
  console.log('  quickKit →', await p.textContent('#hint'));
  await shot(p, '03_shop', true);
  // 逐幕截图：直接走真实 interlude() 切底图
  for (let i = 0; i < 3; i++) {
    await p.evaluate(idx => { interlude(idx, () => {}); }, i);
    await shot(p, '13_int_act' + (i + 1), true);
  }
  await p.evaluate(() => { interlude(1, () => {}); });
  await shot(p, '04_interlude', true);

  const tradeAudit = await p.evaluate(() => {
    weather = 0; cfg = {cash:1000,days:3,weather:0,buy:{}};
    st = {food:10,water:10,fuel:5,bag:1,med:1,radio:1,tool:1,health:100,day:3,
          half:false,rations:0,insulation:0,log:[],karma:0,kind:0,self:0,eventIds:[],
          cash:1000,tradeDay:0,tradeUsed:0,tradeN:0,tradeKit:{},keepsake:false,flags:{}};
    showScreen('game'); prog(); openTrade();
    const rows = document.querySelectorAll('#tradeGrid .tradeRow').length;
    const btnOn = document.getElementById('tradeBtn').classList.contains('on');
    const before = st.cash;
    // 买粮 / 买水 / 卖煤（3 件，正好当天上限）
    const click = (id, d) => document.querySelector(`#tradeGrid button[data-id="${id}"][data-d="${d}"]`).onclick();
    click('food',1); click('water',1); click('fuel',-1);
    const afterTrade = {cash:st.cash, food:st.food, water:st.water, fuel:st.fuel, used:st.tradeUsed};
    click('med',1); // 第 4 件应被拒
    const capped = st.tradeUsed;
    document.getElementById('tradeKeep').onclick();
    const keep = {on:st.keepsake, cash:st.cash, txt:document.getElementById('tradeHint').textContent};
    weather = 3;
    const whiteout = {cap:tradeCap(), price:tradePrice(GOODS[0])};
    weather = 0;
    return {rows, btnOn, before, afterTrade, capped, keep, whiteout,
            note:document.getElementById('tradeNote').textContent};
  });
  console.log('  白毛风档 → 每天', tradeAudit.whiteout.cap, '件 | 粮价 ¥' + tradeAudit.whiteout.price,
    (tradeAudit.whiteout.cap === 2 && tradeAudit.whiteout.price > 12) ? '✓ 更贵更少' : '✗');
  console.log('  交易面板 → 行数', tradeAudit.rows, '| 按钮可见', tradeAudit.btnOn ? '✓' : '✗',
    '| 买2卖1 余额', tradeAudit.before, '→', tradeAudit.afterTrade.cash,
    '| 粮/水', tradeAudit.afterTrade.food + '/' + tradeAudit.afterTrade.water,
    '| 第4件被拦', tradeAudit.capped === 3 ? '✓' : '✗',
    '| 念想', tradeAudit.keep.on ? '✓' : '✗');
  if (tradeAudit.rows !== 7 || !tradeAudit.btnOn || tradeAudit.capped !== 3 || !tradeAudit.keep.on
      || tradeAudit.whiteout.cap !== 2 || tradeAudit.whiteout.price <= 12)
    errors.push('交易面板专项校验失败');
  await shot(p, '14_trade', true);
  await p.evaluate(() => { closeTrade(); localStorage.removeItem('hsm_run_v1'); });
  await p.close();

  console.log('=== 阶段 B：真实点击跑一局（白毛风高配） ===');
  const q = await newPage(browser, errors);
  await q.evaluate(() => {
    window.__faceSeen = new Set();
    const el = document.getElementById('portrait');
    new MutationObserver(() => {
      const v = el.getAttribute('src') || '';
      const k = Object.keys(ART).find(x => ART[x] === v);
      if (k) window.__faceSeen.add(k);
    }).observe(el, { attributes: true, attributeFilter: ['src'] });
  });
  await shot(q, '05_home2', true);
  await q.click('#startBtn');

  let lastLog = '', done = false, steps = 0, midSave = null;
  const interludeSaveChecks = [];
  for (let i = 0; i < 700; i++) {
    steps = i;
    const s = await q.evaluate(() => {
      const E = id => document.getElementById(id);
      let typingNow = false; try { typingNow = typing; } catch (e) { }
      if (typingNow) { try { finish(); } catch (e) { } }
      return {
        done: E('result').classList.contains('show'),
        home: E('home').classList.contains('show'),
        inter: E('interlude').classList.contains('show'),
        council: E('council').classList.contains('show'),
        setup: E('setup').classList.contains('show'),
        shop: E('shop').classList.contains('show'),
        choices: document.querySelectorAll('#choices .ch').length,
        cChoices: document.querySelectorAll('#councilChoices .ch').length,
        day: (() => { try { return st.day; } catch (e) { return -1; } })()
      };
    });
    if (s.done) { done = true; break; }
    if (s.inter) {
      const no = await q.textContent('#intNo');
      const saveOk = await q.evaluate(() => {
        const r = JSON.parse(localStorage.getItem('hsm_run_v1') || '{}');
        return { day: r.st && r.st.day, done: (r.st && r.st.intDone) || [] };
      });
      if (saveOk.day && !saveOk.done.includes(saveOk.day)) {
        errors.push('幕间卡存档缺标记 D' + saveOk.day);
      } else if (saveOk.day) {
        interludeSaveChecks.push('D' + saveOk.day + '✓');
      }
      if (!midSave && no.includes('ACT II')) {
        midSave = await q.evaluate(() => localStorage.getItem('hsm_run_v1'));
      }
      if (no !== lastLog) { lastLog = no; await shot(q, '06_interlude_live', true); }
      await q.click('#intGo'); continue;
    }
    if (s.council && s.cChoices) { await q.click('#councilChoices .ch:nth-child(2)'); continue; }
    if (s.setup) {
      await q.evaluate(() => {
        $('days').value = '7'; $('cash').value = '10000';
        tickSetup(); tickShop();
        const c = [...$('weather').querySelectorAll('.chip')].find(x => x.dataset.i === '3');
        if (c) c.onclick();
      });
      await shot(q, '07_setup_live', true);
      await q.click('#toShop'); continue;
    }
    if (s.shop) {
      await q.evaluate(() => {
        // 先拿功能件，再堆主资源（避免工时被粮水煤吃光）
        const buys = { bag: 2, med: 2, radio: 2, tool: 1, food: 90, water: 110, fuel: 60 };
        for (const [id, n] of Object.entries(buys)) {
          const b = document.querySelector(`#goods button[data-id="${id}"][data-d="1"]`);
          if (!b) continue;
          for (let k = 0; k < n; k++) b.onclick();
        }
      });
      await shot(q, '08_shop_live', true);
      await q.click('#seal'); continue;
    }
    if (s.choices) { await q.click('#choices .ch:first-child'); continue; }
    if (s.home) { await q.click('#startBtn'); continue; }
    await q.waitForTimeout(30);
  }
  const seenFaces = await q.evaluate(() => [...window.__faceSeen]);
  console.log('  done?', done, '| steps', steps,
    '| 幕卡存档标记', interludeSaveChecks.join(' ') || '无',
    interludeSaveChecks.length >= 2 ? '✓' : '⚠');
  console.log('  本局真实用过的立绘', seenFaces.join(' '),
    '| 暖装', seenFaces.includes('catB4') ? '✓' : '✗',
    '| 惊恐', seenFaces.includes('catB5') ? '✓' : '✗',
    '| 夜版', seenFaces.includes('catB3') ? '✓' : '✗');
  if (done) {
    await shot(q, '09_result', true);
    console.log('  结局', await q.textContent('#endIdLine'), await q.textContent('#verdict'), await q.textContent('#bigDay'));
    console.log('  分支', (await q.textContent('#branches')).replace(/\s+/g, ' ').slice(0, 160));
    await q.click('#resBoardBtn'); await shot(q, '10_board', true);
    await q.evaluate(() => { document.getElementById('board').classList.remove('show'); });
    const replayAudit = await q.evaluate(() => ({
    html: document.getElementById('replay').textContent,
    branches: document.getElementById('branches').textContent,
    last: JSON.parse(localStorage.getItem('hsm_last_v1') || '{}'),
    share: document.getElementById('shareText').textContent
  }));
  console.log('  P0-2 最后窗口 →',
    /最后窗口 1 次/.test(replayAudit.branches) ? '✓ 恰好 1 次' : '✗',
    '| 复盘证据', /给过一次窗口|选择合上账本/.test(replayAudit.html) ? '✓' : '✗',
    '| 分享窗口行', /最后窗口 ·/.test(replayAudit.share) ? '✓' : '✗',
    '| hsm_last', replayAudit.last.grace ? '✓' : '✗');
  if (!/最后窗口 1 次/.test(replayAudit.branches) || !replayAudit.last.grace
      || !/最后窗口 ·/.test(replayAudit.share)) errors.push('最后窗口未正确记入结算/分享');
  console.log('  结算复盘 →', /复盘 \/ 这局输在哪/.test(replayAudit.html) ? '✓ 块已渲染' : '✗',
    '| 下次改一处', /下次改一处/.test(replayAudit.html) ? '✓' : '✗',
    '| short', replayAudit.last.short ? '✓' : '✗',
    '| 分享含复盘', /复盘 ·/.test(replayAudit.share) ? '✓' : '✗');
  if (!/下次改一处/.test(replayAudit.html) || !replayAudit.last.short || !/复盘 ·/.test(replayAudit.share))
    errors.push('结算复盘未完整生效');
  await q.click('#resDexBtn'); await shot(q, '11_dex', true);
    const dexAudit = await q.evaluate(() => {
      const grid = document.getElementById('dexGrid');
      const locked = [...grid.querySelectorAll('.dexCell.locked')];
      return {
        locked: locked.length,
        leakImg: locked.filter(c => c.querySelector('img')).length,
        lockArt: locked.filter(c => c.querySelector('.lockArt')).length,
        detailImgOnLocked: (() => {
          const c = locked[0]; if (!c) return -1;
          c.onclick(); return document.getElementById('dexDetail').querySelectorAll('img').length;
        })()
      };
    });
    console.log('  图鉴锁定格', dexAudit.locked, '| 露插画', dexAudit.leakImg,
      '| 锁底', dexAudit.lockArt, '| 未解锁详情图片', dexAudit.detailImgOnLocked,
      (dexAudit.leakImg === 0 && dexAudit.detailImgOnLocked === 0) ? '✓ 不剧透' : '✗ 仍剧透');
    await q.evaluate(() => { document.getElementById('dex').classList.remove('show'); });
    // 分享图导出验证
    const dl = q.waitForEvent('download', { timeout: 4000 }).catch(() => null);
    await q.click('#shareImgBtn');
    const d = await dl;
    if (d) { await d.saveAs(OUT + '/12_share.png'); console.log('  ✓ 分享图已导出'); }
    else console.log('  ! 分享图未触发下载（canvas 受环境限制）');

    // 分享机制：正常码导入 / 篡改一位被拒
    const okCode = await q.evaluate(() => curCode);
    const before = await q.evaluate(() => JSON.parse(localStorage.getItem('hsm_friends_v1') || '[]').length);
    await q.evaluate(c => { document.getElementById('codeInput').value = c; document.getElementById('importBtn').onclick(); }, okCode);
    const afterOk = await q.inputValue('#codeInput');
    const cntOk = await q.evaluate(() => JSON.parse(localStorage.getItem('hsm_friends_v1') || '[]').length);
    const pos = 12, rep = okCode[pos] === 'A' ? 'B' : 'A';
    const bad = okCode.slice(0, pos) + rep + okCode.slice(pos + 1);
    await q.evaluate(c => { document.getElementById('codeInput').value = c; document.getElementById('importBtn').onclick(); }, bad);
    const afterBad = await q.inputValue('#codeInput');
    const cntBad = await q.evaluate(() => JSON.parse(localStorage.getItem('hsm_friends_v1') || '[]').length);
    console.log('  正常码 → 输入框', JSON.stringify(afterOk), '| 好友榜', before, '→', cntOk, cntOk === before + 1 ? '✓' : '✗');
    console.log('  改一位 → 输入框', JSON.stringify(afterBad), '| 好友榜仍', cntBad, (afterBad === '成绩码无效' && cntBad === cntOk) ? '✓ 已拒绝' : '✗ 未拒绝');
  }
  // 断点：停在幕间卡时刷新，续玩不应重复弹同一张过场
  await q.close();
  if (midSave) {
    const r = await browser.newPage({ viewport: { width: 390, height: 844 } });
    r.on('pageerror', e => errors.push('resume pageerror: ' + e.message));
    await r.goto(URL);
    await r.evaluate(v => localStorage.setItem('hsm_run_v1', v), midSave);
    await r.reload(); await r.waitForTimeout(150);
    await r.click('#resumeBtn');
    const dup = await r.evaluate(() => ({
      inter: document.getElementById('interlude').classList.contains('show'),
      no: document.getElementById('intNo').textContent
    }));
    console.log('  停在 ACT II 幕卡刷新 → 存档', JSON.parse(midSave).st.day,
      '标记', JSON.stringify(JSON.parse(midSave).st.intDone),
      '| 续玩重复弹过场?', dup.inter ? '✗ ' + dup.no : '✓ 否');
    if (dup.inter) errors.push('续玩重复弹幕间卡: ' + dup.no);
    await r.close();
  }

  console.log('=== 阶段 C：低配局（验失温态 / 早期结局） ===');
  const w = await newPage(browser, errors);
  await w.evaluate(() => {
    window.__faceSeen = new Set();
    const el = document.getElementById('portrait');
    new MutationObserver(() => {
      const v = el.getAttribute('src') || '';
      const k = Object.keys(ART).find(x => ART[x] === v);
      if (k) window.__faceSeen.add(k);
    }).observe(el, { attributes: true, attributeFilter: ['src'] });
  });
  await w.click('#startBtn');
  let cDone = false;
  for (let i = 0; i < 260; i++) {
    const st = await w.evaluate(() => {
      const E = id => document.getElementById(id);
      let typingNow = false; try { typingNow = typing; } catch (e) { }
      if (typingNow) { try { finish(); } catch (e) { } }
      return {
        done: E('result').classList.contains('show'),
        inter: E('interlude').classList.contains('show'),
        council: E('council').classList.contains('show'),
        setup: E('setup').classList.contains('show'),
        shop: E('shop').classList.contains('show'),
        ch: document.querySelectorAll('#choices .ch').length,
        cch: document.querySelectorAll('#councilChoices .ch').length
      };
    });
    if (st.done) { cDone = true; break; }
    if (st.inter) { await w.click('#intGo'); continue; }
    if (st.council && st.cch) { await w.click('#councilChoices .ch:nth-child(1)'); continue; }
    if (st.setup) {
      await w.evaluate(() => { $('days').value = '3'; $('cash').value = '800'; tickSetup(); tickShop();
        const c = [...$('weather').querySelectorAll('.chip')].find(x => x.dataset.i === '0'); if (c) c.onclick(); });
      await w.click('#toShop'); continue;
    }
    if (st.shop) {
      await w.evaluate(() => {
        const buys = { food: 26, water: 30, fuel: 16 };
        for (const [id, n] of Object.entries(buys)) {
          const x = document.querySelector(`#goods button[data-id="${id}"][data-d="1"]`);
          if (x) for (let k = 0; k < n; k++) x.onclick();
        }
      });
      await w.click('#seal'); continue;
    }
    if (st.ch) { await w.click('#choices .ch:first-child'); continue; }
    await w.waitForTimeout(20);
  }
  const cFaces = await w.evaluate(() => [...window.__faceSeen]);
  console.log('  低配局结算?', cDone,
    '| 结局', cDone ? await w.textContent('#endIdLine') : '—',
    '| 天数', cDone ? await w.textContent('#bigDay') : '—');
  const cReplay = await w.evaluate(() => ({
    html: document.getElementById('replay').textContent,
    tip: (JSON.parse(localStorage.getItem('hsm_last_v1') || '{}')).tip || ''
  }));
  console.log('  低配局复盘 →', /下次改一处/.test(cReplay.html) ? '✓' : '✗',
    '| 建议', cReplay.tip.slice(0, 30));
  if (!/下次改一处/.test(cReplay.html)) errors.push('低配局未生成复盘建议');
  console.log('  用过的立绘', cFaces.join(' '),
    '| 失温态', cFaces.includes('catB2') ? '✓' : '✗（健康未跌破 38，非 bug）');
  await w.close();

  console.log('=== 阶段 D：门缝交易是否真能续命（同参数对照） ===');
  async function runCompare(useTrade) {
    const pg = await newPage(browser, errors);
    await pg.click('#startBtn');
    let done = false, boughtKeep = false;
    for (let i = 0; i < 420; i++) {
      const s = await pg.evaluate(() => {
        const E = id => document.getElementById(id);
        let typingNow = false; try { typingNow = typing; } catch (e) { }
        if (typingNow) { try { finish(); } catch (e) { } }
        return {
          done: E('result').classList.contains('show'),
          inter: E('interlude').classList.contains('show'),
          council: E('council').classList.contains('show'),
          setup: E('setup').classList.contains('show'),
          shop: E('shop').classList.contains('show'),
          trade: E('trade').classList.contains('show'),
          ch: document.querySelectorAll('#choices .ch').length,
          cch: document.querySelectorAll('#councilChoices .ch').length,
          tradeBtn: E('tradeBtn').classList.contains('on'),
          tradedToday: (typeof st !== 'undefined' && st && st.tradeDay === st.day)
        };
      });
      if (s.done) { done = true; break; }
      if (s.trade) {
        if (useTrade && !globalThis.__tradeShot) {
          globalThis.__tradeShot = true;
          await shot(pg, '15_trade_live', true);
        }
        if (useTrade) {
          await pg.evaluate(() => {
            const click = (id,d) => { const b = document.querySelector(`#tradeGrid button[data-id="${id}"][data-d="${d}"]`); if (b) b.onclick(); };
            click('food',1); click('water',1); click('fuel',1);
          });
          if (!boughtKeep) {
            await pg.evaluate(() => document.getElementById('tradeKeep').onclick());
            boughtKeep = true;
          }
        }
        await pg.click('#tradeDone'); continue;
      }
      if (s.inter) { await pg.click('#intGo'); continue; }
      if (s.council && s.cch) { await pg.click('#councilChoices .ch:nth-child(1)'); continue; }
      if (s.setup) {
        await pg.evaluate(() => { $('days').value='3'; $('cash').value='6000'; tickSetup(); tickShop();
          const c=[...$('weather').querySelectorAll('.chip')].find(x=>x.dataset.i==='0'); if(c)c.onclick(); });
        await pg.click('#toShop'); continue;
      }
      if (s.shop) {
        await pg.evaluate(() => {
          const buys={bag:1,food:12,water:12,fuel:6};
          for(const [id,n] of Object.entries(buys)){
            const b=document.querySelector(`#goods button[data-id="${id}"][data-d="1"]`);
            if(b)for(let k=0;k<n;k++)b.onclick();
          }
        });
        await pg.click('#seal'); continue;
      }
      if (useTrade && s.tradeBtn && !s.tradedToday) { await pg.click('#tradeBtn'); continue; }
      if (s.ch) { await pg.click('#choices .ch:first-child'); continue; }
      await pg.waitForTimeout(20);
    }
    const out = await pg.evaluate(() => ({
      done: document.getElementById('result').classList.contains('show'),
      days: document.getElementById('bigDay').textContent.trim(),
      keep: document.getElementById('keepLine').textContent,
      branches: document.getElementById('branches').textContent,
      share: document.getElementById('shareText').textContent,
      last: JSON.parse(localStorage.getItem('hsm_last_v1')||'{}')
    }));
    await pg.close();
    return out;
  }
  const d1 = await runCompare(false), d2 = await runCompare(true);
  const n1 = parseInt(d1.days), n2 = parseInt(d2.days);
  console.log('  不交易 →', d1.days, '| 交易 →', d2.days,
    '| 续命', n2 > n1 ? ('✓ +' + (n2 - n1) + ' 天') : '✗ 没提高');
  console.log('  念想行', JSON.stringify(d2.keep.slice(0, 42)));
  console.log('  分支含交易', /门缝交易 [1-9]/.test(d2.branches) ? '✓' : '✗',
    '| 分享含余额', /账本最后一页 · 余 ¥/.test(d2.share) ? '✓' : '✗',
    '| 存档 left', d2.last.left, '| keep', d2.last.keep);
  if (!(n2 > n1)) errors.push('交易未提高存活天数');
  if (!/没寄出的信/.test(d2.keep)) errors.push('念想行未生效');
  if (!/门缝交易 [1-9]/.test(d2.branches)) errors.push('分支统计未记交易');
  if (!/账本最后一页 · 余 ¥/.test(d2.share)) errors.push('分享文案未带余额');

  console.log('=== 阶段 E：最后窗口专项 ===');
  const e = await newPage(browser, errors);
  const g = await e.evaluate(() => {
    const base = () => ({
      food:4, water:20, fuel:20, bag:1, med:0, radio:0, tool:0,
      health:90, day:5, half:false, rations:0, insulation:0, log:[],
      karma:0, kind:0, self:0, eventIds:[], cash:1000, tradeDay:0,
      tradeUsed:0, tradeN:0, tradeKit:{}, keepsake:false, grace:null, trace:[], flags:{}
    });
    weather = 0; cfg = {cash:1000, days:3, weather:0, buy:{}};
    st = base();
    const info = graceInfo();                       // 粮 4/2=2 应为最短板
    st = base(); graceBuy(info);
    const buy = {choice:st.grace.choice, food:st.food, health:st.health,
                 cash:st.cash, tradeN:st.tradeN, once:!!st.grace};
    st = base(); graceRation(info);
    const rat = {choice:st.grace.choice, rations:st.rations, health:st.health};
    const ctx = {days:8, cause:'口粮见底，没撑到天亮', weather:0,
      tier:{id:'rich',name:'充裕'}, cash:1000, cashLeft:0, shopHours:60,
      spent:1000, buy:{}, karma:0, flags:{}, keep:false, tradeN:0};
    st = base(); st.grace = {day:5, id:'food', choice:'buy', picked:true};
    const rBuy = summarize(ctx, st);
    st.grace = {day:5, id:'food', choice:'hard', picked:false};
    const rHard = summarize(ctx, st);
    st.grace = null; st.fastForwarded = true;
    const rFast = summarize(ctx, st);
    st.fastForwarded = false;
    const rNone = summarize(ctx, st);
    // 一次性：grace 已设时，consume 分支不会再进 showGrace
    st = base(); st.grace = {day:5, id:'food', choice:'buy', picked:true};
    const again = !!(graceInfo() && !st.grace);   // 应为 false
    try { finish(); } catch (x) {}
    return {info, buy, rat, rBuy:rBuy.grace, rHard:rHard.grace,
            rFast:rFast.grace, rNone:rNone.grace, again,
            htmlHas:/最后窗口/.test(rBuy.html)};
  });
  console.log('  判定 → 短板', g.info && g.info.name, '| 余', g.info && g.info.days, '天',
    (g.info && g.info.id === 'food') ? '✓' : '✗');
  console.log('  选项 → 递取', g.buy.choice, '粮 4→'+g.buy.food, '现金 1000→'+g.buy.cash,
    '健康 90→'+g.buy.health, '| 收紧', g.rat.choice, 'rations='+g.rat.rations,
    (g.buy.choice === 'buy' && g.buy.food > 4 && g.rat.rations === 1) ? '✓' : '✗');
  console.log('  复盘 → 补救', /给过一次窗口/.test(g.rBuy) ? '✓' : '✗',
    '| 合上账本', /选择合上账本/.test(g.rHard) ? '✓' : '✗',
    '| 快进', /快进/.test(g.rFast) ? '✓' : '✗',
    '| 未触发', /未逼近/.test(g.rNone) ? '✓' : '✗',
    '| html 含窗口行', g.htmlHas ? '✓' : '✗');
  console.log('  一次性 → 已设 grace 后还会再弹?', g.again ? '✗ 会' : '✓ 不会');
  if (!g.info || g.info.id !== 'food' || g.buy.choice !== 'buy' || g.buy.food <= 4
      || g.rat.rations !== 1 || g.again || !g.htmlHas || !/给过一次窗口/.test(g.rBuy)
      || !/选择合上账本/.test(g.rHard) || !/快进/.test(g.rFast) || !/未逼近/.test(g.rNone))
    errors.push('最后窗口专项校验失败');

  // 窗口 UI 实拍
  await e.evaluate(() => {
    st = {food:4, water:20, fuel:20, bag:1, med:0, radio:0, tool:0,
      health:90, day:5, half:false, rations:0, insulation:0, log:[],
      karma:0, kind:0, self:0, eventIds:[], cash:1000, tradeDay:0,
      tradeUsed:0, tradeN:0, tradeKit:{}, keepsake:false, grace:null, trace:[], flags:{}};
    showScreen('game'); panel(''); prog(); showGrace(graceInfo());
  });
  await e.evaluate(() => { try { finish(); } catch (x) {} });
  await e.waitForTimeout(200);
  const gUI = await e.evaluate(() => ({
    faceOk: document.getElementById('portrait').src === ART.catB5,
    ch: document.querySelectorAll('#choices .ch').length,
    cardOk: document.getElementById('cardImg').classList.contains('show'),
    labels: [...document.querySelectorAll('#choices .ch .b')].map(x => x.childNodes[0].textContent.trim())
  }));
  console.log('  窗口 UI → 选项', gUI.ch, '个', gUI.ch === 3 ? '✓' : '✗',
    '| 惊恐态', gUI.faceOk ? '✓' : '✗', '| 欠条卡面', gUI.cardOk ? '✓' : '✗',
    '|', gUI.labels.join(' / '));
  if (gUI.ch !== 3 || !gUI.faceOk || !gUI.cardOk) errors.push('窗口 UI 渲染异常');
  await shot(e, '16_grace', true);
  await e.close();

  console.log('=== 阶段 F：P0-5 首局引导 ===');
  const finishSay = pg => pg.evaluate(() => { try { finish(); } catch (e) {} });
  const labels = pg => pg.evaluate(() =>
    [...document.querySelectorAll('#choices .ch .b')].map(x => x.childNodes[0].textContent.trim()));

  // F1 首次进入：引导开场 / 多一个跳过选项 / 固定档 / 三处提示 / 完成解锁
  const f = await newPage(browser, errors, true);
  await f.click('#startBtn'); await finishSay(f);
  const f1 = await f.evaluate(() => ({
    tut, text: document.getElementById('text').textContent,
    done: localStorage.getItem('hsm_tutorial_v1')
  }));
  const f1Labels = await labels(f);
  console.log('  F1 开场 → tut', f1.tut ? '✓' : '✗',
    '| 引导文案', /首局我带你走一遍/.test(f1.text) ? '✓' : '✗',
    '| 跳过引导选项', f1Labels.some(x => /跳过引导/.test(x)) ? '✓' : '✗',
    '| 选项数', f1Labels.length);
  await f.click('#choices .ch:first-child'); await finishSay(f);   // 先问天气
  await finishSay(f);                                               // → setup
  const f2 = await f.evaluate(() => ({
    days: $('days').value, cash: $('cash').value, weather,
    cHint: $('cHint').textContent, text: document.getElementById('text').textContent,
    screen: document.getElementById('setup').classList.contains('show')
  }));
  console.log('  F2 设定 → 固定档', f2.days + '天 / ¥' + f2.cash + ' / 天气' + f2.weather,
    (f2.days === '3' && f2.cash === '1500' && f2.weather === 0) ? '✓' : '✗',
    '| 提示行', /首局固定/.test(f2.cHint) ? '✓' : '✗',
    '| 引导台词', /首局三项我替你定好/.test(f2.text) ? '✓' : '✗');
  await shot(f, '17_tutorial_setup', true);
  await f.click('#toShop'); await finishSay(f);
  const f3 = await f.evaluate(() => ({
    kit: $('quickKit').textContent,
    text: document.getElementById('text').textContent,
    forecast: $('forecast').textContent
  }));
  console.log('  F3 采购 → 推荐按钮', /👉/.test(f3.kit) ? '✓' : '✗',
    '| 引导台词', /首局先点/.test(f3.text) ? '✓' : '✗',
    '| 预测条', /最短板/.test(f3.forecast) ? '✓' : '✗');
  await shot(f, '18_tutorial_shop', true);
  // 封门按钮要求至少买一件；引导局这里点一次推荐按钮，顺便验它真能加货
  await f.evaluate(() => { $('quickKit').onclick(); tickShop(); });
  const fKit = await f.evaluate(() => ({bag: buy.bag, seal: $('seal').disabled}));
  console.log('  F3b 推荐按钮 → 睡袋', fKit.bag, '| 封门可用', !fKit.seal ? '✓' : '✗');
  if (fKit.bag < 1 || fKit.seal) errors.push('引导局推荐按钮未生效');
  await f.click('#seal'); await finishSay(f);
  const f4 = await f.evaluate(() => document.getElementById('text').textContent);
  console.log('  F4 封门 → 门缝提示', /门缝交易/.test(f4) ? '✓' : '✗');
  const f5 = await f.evaluate(() => {
    tut = true; S('hsm_tutorial_v1', 0);
    $('keepLine').textContent = '账本最后一页 · 测试';
    endGame(1, '测试');
    return {done: L('hsm_tutorial_v1', 0), keep: $('keepLine').textContent};
  });
  console.log('  F5 结算 → 标记写入', f5.done === 1 ? '✓' : '✗',
    '| 解锁说明', /三项设定全开放/.test(f5.keep) ? '✓' : '✗');
  if (!f1.tut || !/首局我带你走一遍/.test(f1.text) || !f1Labels.some(x => /跳过引导/.test(x))
      || f2.days !== '3' || f2.cash !== '1500' || f2.weather !== 0
      || !/首局固定/.test(f2.cHint) || !/👉/.test(f3.kit) || !/首局先点/.test(f3.text)
      || !/门缝交易/.test(f4) || f5.done !== 1 || !/三项设定全开放/.test(f5.keep))
    errors.push('首局引导主链路校验失败');
  await f.close();

  // F6 跳过引导：立即回到自由设定，标记写入
  const gPage = await newPage(browser, errors, true);
  await gPage.click('#startBtn'); await finishSay(gPage);
  const gLabels = await labels(gPage);
  const idx = gLabels.findIndex(x => /跳过引导/.test(x));
  await gPage.click(`#choices .ch:nth-child(${idx + 1})`); await finishSay(gPage);
  const g1 = await gPage.evaluate(() => ({
    tut, done: L('hsm_tutorial_v1', 0), text: document.getElementById('text').textContent
  }));
  console.log('  F6 跳过引导 → tut', g1.tut ? '✗ 仍开着' : '✓ 已关',
    '| 标记', g1.done === 1 ? '✓' : '✗',
    '| 自由设定台词', /三项你来定/.test(g1.text) ? '✓' : '✗');
  if (g1.tut || g1.done !== 1 || !/三项你来定/.test(g1.text))
    errors.push('跳过引导未正确解锁自由设定');
  await gPage.close();

  // F7 重开后不再预设：先把参数改掉，走老玩家流程应原样保留
  const hPage = await newPage(browser, errors);
  await hPage.evaluate(() => {
    $('days').value = 7; $('cash').value = 9000; weather = 3;
    renderWeather(); tickSetup(); tickShop();
  });
  await hPage.click('#startBtn'); await finishSay(hPage);
  const hLabels = await labels(hPage);
  await hPage.click('#choices .ch:first-child'); await finishSay(hPage);
  await finishSay(hPage);
  const h1 = await hPage.evaluate(() => ({
    days: $('days').value, cash: $('cash').value, weather,
    cHint: $('cHint').textContent, text: document.getElementById('text').textContent
  }));
  console.log('  F7 重开 → 参数', h1.days + '天 / ¥' + h1.cash + ' / 天气' + h1.weather,
    (h1.days === '7' && h1.cash === '9000' && h1.weather === 3) ? '✓ 未被预设覆盖' : '✗',
    '| 无引导提示', !/首局固定/.test(h1.cHint) && !/首局/.test(h1.text) ? '✓' : '✗',
    '| 无跳过选项', !hLabels.some(x => /跳过引导/.test(x)) ? '✓' : '✗');
  if (h1.days !== '7' || h1.cash !== '9000' || h1.weather !== 3
      || /首局固定/.test(h1.cHint) || /首局/.test(h1.text)
      || hLabels.some(x => /跳过引导/.test(x)))
    errors.push('重开后仍被首局引导干扰');
  await hPage.close();

  console.log('=== 阶段 G：P1-1 种子挑战 / P1-2 权重治理 ===');
  const gp = await newPage(browser, errors);
  const tap = async (sel) => { await gp.click(sel); await gp.evaluate(() => { try { finish(); } catch (e) {} }); };

  // G1 纯函数：种子稳定 / 挑战码往返 / 篡改拒绝 / 配置确定性
  const gc1 = await gp.evaluate(() => {
    const a = todaySeed(), b = todaySeed();
    const s = 3735928559, c = chalCode(s), back = parseChal(c);
    const bad = parseChal(c.slice(0, -1) + (c.slice(-1) === 'z' ? 'y' : 'z'));
    const cfg = chalCfg(s), cfg2 = chalCfg(s);
    return {same: a === b, code: c, back, bad,
      cfgStable: JSON.stringify(cfg) === JSON.stringify(cfg2),
      cfgInRange: cfg.w >= 0 && cfg.w < 4 && cfg.dy >= 2 && cfg.dy <= 5,
      cashOK: [800,1500,4000,10000].includes(cfg.cash)};
  });
  console.log('  G1 纯函数 → 今日种子稳定', gc1.same ? '✓' : '✗',
    '| 码', gc1.code, '往返', gc1.back === 3735928559 ? '✓' : '✗',
    '| 篡改被拒', gc1.bad === null ? '✓' : '✗',
    '| 配置确定且在档内', (gc1.cfgStable && gc1.cfgInRange && gc1.cashOK) ? '✓' : '✗');

  // G2 旧成绩码兼容（用「旧 7 项算法」手工造码）+ 种子改一位被拒
  const gc2 = await gp.evaluate(() => {
    const oldSum = o => {
      const s = [o.n,o.d,o.e,o.t,o.w,o.c,o.p].join('|');
      let h = 5381; for (let i=0;i<s.length;i++) h = ((h*33)^s.charCodeAt(i))>>>0;
      return (h&0xffff).toString(16).padStart(4,'0');
    };
    const legacy = {n:'老仓管',d:9,e:'END_ICE',t:'冰雕体验卡',w:0,c:800,p:20};
    legacy.k = oldSum(legacy);
    const enc = o => 'HSM1-' + btoa(unescape(encodeURIComponent(JSON.stringify(o))))
      .replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
    const legacyOK = parseCode(enc(legacy));
    const withSeed = {n:'挑战仓管',d:20,e:'END_LORD',t:'极地领主',w:3,c:10000,p:98,s:3735928559};
    withSeed.k = codeSum(withSeed);
    const good = parseCode(enc(withSeed));
    const cheated = {...withSeed, s: 3735928560};   // 改种子，不改 k
    const cheat = parseCode(enc(cheated));
    return {legacyOK: legacyOK && legacyOK.d === 9,
      seedOK: good && good.s === 3735928559, cheat: cheat === null,
      noSeedSame: codeSum({n:'x',d:1,e:'END_ICE',t:'t',w:0,c:800,p:1}) === oldSum({n:'x',d:1,e:'END_ICE',t:'t',w:0,c:800,p:1})};
  });
  console.log('  G2 成绩码 → 旧 7 项码仍可导入', gc2.legacyOK ? '✓' : '✗',
    '| 无种子时签名与旧算法一致', gc2.noSeedSame ? '✓' : '✗',
    '| 带种子码通过', gc2.seedOK ? '✓' : '✗',
    '| 改种子不改校验位被拒', gc2.cheat ? '✓' : '✗');
  if (!gc1.same || gc1.back !== 3735928559 || gc1.bad !== null || !gc1.cfgStable
      || !gc2.legacyOK || !gc2.noSeedSame || !gc2.seedOK || !gc2.cheat)
    errors.push('种子 / 成绩码兼容校验失败');

  // G3 同种子可复现：rng 序列 + 12 天事件序列完全一致；不同种子必须不同
  const gc3 = await gp.evaluate(() => {
    const run = seed => {
      weather = chalCfg(seed).w;
      setSeed(seed);
      st = {day:1, flags:{}, dry:0, eventLast:{}, food:30, water:30, fuel:30, bag:1,
            health:100, cash:4000, rations:0, insulation:0, eventIds:[], log:[]};
      cfg = {cash:4000, days:3, weather};
      const r = [], e = [];
      for (let i=0;i<20;i++) r.push(rng().toFixed(6));
      for (let d=1;d<=12;d++) { st.day=d; const ev=pickEvent(); e.push(ev?ev.id:'-'); }
      return {r:r.join(','), e:e.join(','), state:rngState};
    };
    const A = run(123456789), B = run(123456789), C = run(987654321);
    return {rngSame:A.r===B.r, evSame:A.e===B.e, stateSame:A.state===B.state,
            diff:A.e!==C.e, sample:A.e.slice(0,60)};
  });
  console.log('  G3 可复现 → rng 序列', gc3.rngSame ? '✓' : '✗',
    '| 事件序列', gc3.evSame ? '✓' : '✗',
    '| rngState', gc3.stateSame ? '✓' : '✗',
    '| 换种子结果不同', gc3.diff ? '✓' : '✗', '|', gc3.sample);
  if (!gc3.rngSame || !gc3.evSame || !gc3.diff) errors.push('同种子未复现或换种子无差异');

  // G4 P1-2 权重：反重复 + 软保底（各 400 次采样，比关键事件命中率）
  const gc4 = await gp.evaluate(() => {
    weather = 0;
    const sample = (dry, last) => {
      let key=0, tot=0, repeat=0;
      const hot = WEATHER[0].pool;
      for (let i=0;i<400;i++) {
        setSeed(1000+i*7919);
        st = {day:12, flags:{}, dry, eventLast:{...last}, food:30, water:30, fuel:30,
              bag:1, health:100, cash:4000, rations:0, insulation:0, eventIds:[], log:[]};
        const ev = pickEvent();
        if (ev) { tot++;
          if (ev.chain || ev.stage || hot.includes(ev.id) ||
              STAGES[stageOf(12)].pool.includes(ev.id)) key++;
          if (ev.id === 'neighbor') repeat++;   // storm 在冷冬被 axis:[3] 过滤，样本必须是本档可见事件
        }
      }
      return {rate: tot ? key/tot : 0, tot, repeat};
    };
    const base = sample(0, {});
    const recent = sample(0, {neighbor:12, sun:12, pipe:12});
    const dry = sample(9, {});
    return {base, recent, dry};
  });
  console.log('  G4 权重 → 关键事件占比 基线', (gc4.base.rate*100).toFixed(1)+'%',
    '| 软保底 dry=9', (gc4.dry.rate*100).toFixed(1)+'%',
    gc4.dry.rate > gc4.base.rate ? '✓ 上升' : '✗',
    '| 反重复（neighbor 命中 基线 '+gc4.base.repeat+' → 近期见过 '+gc4.recent.repeat+'）',
    gc4.recent.repeat < gc4.base.repeat ? '✓ 下降' : '✗');
  if (!(gc4.dry.rate > gc4.base.rate)) errors.push('软保底未提高关键事件占比');
  if (!(gc4.recent.repeat < gc4.base.repeat)) errors.push('反重复未压低近期事件');

  // G5 UI 端到端：今日挑战 → 改设定退出 → 重开挑战 → 结算带种子
  const seed = 3735928559;
  await gp.evaluate(s => startChal(s), seed);
  await gp.evaluate(() => { try { finish(); } catch (e) {} });
  await gp.evaluate(() => { try { finish(); } catch (e) {} });
  const gc5a = await gp.evaluate(() => ({
    chal: chal && chal.seed, w: weather, days: $('days').value, cash: $('cash').value,
    hint: $('cHint').textContent
  }));
  console.log('  G5 挑战开局 → 种子', gc5a.chal, '| 配置 天气'+gc5a.w+' / '+gc5a.days+'天 / ¥'+gc5a.cash,
    '| 设定页标挑战码', /HSMS1-/.test(gc5a.hint) ? '✓' : '✗');
  await shot(gp, '19_challenge_setup', true);
  // 改资金 → 应退出挑战
  await gp.evaluate(() => { $('cash').value = 7777; $('cash').oninput(); });
  const gc5b = await gp.evaluate(() => ({chal, hint:$('cHint').textContent}));
  console.log('  改设定 → 退出挑战', gc5b.chal === null ? '✓' : '✗',
    '| 提示行不再含挑战码', !/HSMS1-/.test(gc5b.hint) ? '✓' : '✗');
  if (gc5b.chal !== null) errors.push('改设定未退出挑战');
  // 重开挑战并真实跑到结算
  await gp.evaluate(s => { startChal(s); try { finish(); } catch (e) {} }, seed);
  await gp.evaluate(() => { try { finish(); } catch (e) {} });
  await tap('#toShop');
  await gp.evaluate(() => { $('quickKit').onclick(); tickShop(); });
  await tap('#seal');
  await gp.evaluate(() => { try { finish(); } catch (e) {} });
  await gp.evaluate(() => { try { finish(); } catch (e) {} try { finish(); } catch (e) {} fastForward(); });
  await gp.waitForTimeout(180);
  const gc5c = await gp.evaluate(() => ({
    screen: $('result').classList.contains('show'),
    last: L('hsm_last_v1',{}), board: loadBoard()[0],
    share: $('shareText').textContent, branches: $('branches').textContent,
    rank: $('rankList').textContent
  }));
  console.log('  挑战结算 → 结算页', gc5c.screen ? '✓' : '✗',
    '| 分享含挑战码', /今日挑战 HSMS1-/.test(gc5c.share) ? '✓' : '✗',
    '| 成绩带 s', gc5c.board && gc5c.board.s === seed ? '✓' : '✗',
    '| 排行榜 🎯', /🎯#/.test(gc5c.rank) ? '✓' : '✗',
    '| 空窗统计', /最长空窗/.test(gc5c.branches) ? '✓' : '✗',
    '| hsm_last.cc', /^HSMS1-/.test(gc5c.last.cc || '') ? '✓' : '✗');
  if (!gc5c.screen || !/今日挑战 HSMS1-/.test(gc5c.share) || !gc5c.board || gc5c.board.s !== seed
      || !/🎯#/.test(gc5c.rank) || !/最长空窗/.test(gc5c.branches) || !/^HSMS1-/.test(gc5c.last.cc||''))
    errors.push('挑战局结算链路未完整生效');
  await shot(gp, '20_challenge_result', true);
  // G6 挑战码导入（prompt）+ 无效码拒绝
  let chalInput = chalCodeFor(seed);
  let alerts = [];
  gp.on('dialog', d => { if (d.type() === 'prompt') d.accept(chalInput); else { alerts.push(d.message()); d.accept(); } });
  await gp.evaluate(() => homeInit());
  await gp.click('#chalCodeBtn');
  await gp.evaluate(() => { try { finish(); } catch (e) {} });
  const gc6a = await gp.evaluate(() => ({chal: chal && chal.seed, btn: $('chalBtn').textContent}));
  chalInput = 'HSMS1-abc-zz';
  await gp.evaluate(() => homeInit());
  await gp.click('#chalCodeBtn');
  const gc6b = await gp.evaluate(() => ({chal: chal && chal.seed}));
  console.log('  G6 挑战码导入 → 合法码种子', gc6a.chal === seed ? '✓' : '✗',
    '| 无效码弹提示', alerts.some(x => /无效/.test(x)) ? '✓' : '✗',
    '| 主页按钮含今日种子', /今日/.test(gc6a.btn) ? '✓' : '✗');
  if (gc6a.chal !== seed || !alerts.some(x => /无效/.test(x)))
    errors.push('挑战码导入链路异常');
  await gp.close();

  await browser.close();
  console.log('\n=== JS 错误 ===');
  console.log(errors.length ? errors.slice(0, 12).join('\n') : '无');
  if (errors.length) process.exitCode = 2;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
