#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建后校验产物体积（单文件页游专用）。
对应看板议题「单文件最容易悄悄变大」：不是打印一下 KB，而是带预算、分项拆账、
增长护栏、离线完整性检查的硬闸门。超限 / 缺件直接 exit 1，构建失败。

用法: python3 check_size.py [产物路径]
产出: 体积校验报告.md + size_history.json
"""
import json, os, re, subprocess, sys, datetime

DEFAULT = '极寒末世囤货模拟器_完整版.html'
REPORT = '体积校验报告.md'
HISTORY = 'size_history.json'

# 预算（KiB）。TOTAL 是硬闸门，分项是软预算：超了报警但不打断构建
TOTAL_LIMIT = 600          # 单文件离线，留余量给后续事件池
SOFT = {
    'hero': 90,            # 主页 Hero
    'end_art': 240,        # 11 张结局插画
    'role': 60,            # 2 张基础透明角色层
    'diff': 55,            # 4 张角色差分
    'card': 180,           # 档案卡面
    'scene': 55,           # 三幕幕间插画（按实测上调：16:9 场景细节多于预估）
    'goods': 32,           # 七张物资卡专图
    'skeleton': 140,       # HTML / CSS / JS 本体
}
GROWTH_WARN = 0.12         # 相比上次构建增长超过 12% 报警
WARN_AT = 590              # 逼近硬闸门的预警线（KiB），只警告不打断
TEXT_BASELINE = None       # 去掉全部 data URI 后的文案/代码字符数，用于看「这次加了多少字」

END_IDS = ['END_ICE', 'END_HAMSTER', 'END_KEEPER', 'END_LOGISTIC', 'END_LORD',
           'END_COMMUNE', 'END_FORTRESS', 'END_ASH', 'END_MONEY', 'END_SIGNAL', 'END_EMPTY']


def kib(n):
    return round(n / 1024, 1)


def asset_bill(art, end_art, hero_uri):
    """逐张解码：原始尺寸 / 解码后字节 / base64 字符 / 格式。纯构建期，不进产物。"""
    import io, base64
    from PIL import Image
    rows = []
    items = [('hero', hero_uri)] + list(art.items()) + list(end_art.items())
    for name, uri in items:
        if not isinstance(uri, str) or 'base64,' not in uri:
            continue
        try:
            blob = base64.b64decode(uri.split(',', 1)[1])
            im = Image.open(io.BytesIO(blob))
            rows.append((name, im.format or '?', '%dx%d' % im.size,
                         len(blob), len(uri)))
        except Exception as ex:
            rows.append((name, 'ERR', str(ex)[:24], 0, len(uri)))
    return rows


def run(path=DEFAULT):
    if not os.path.exists(path):
        print('FAIL 产物不存在:', path)
        return 1
    raw = open(path, 'rb').read()
    total = len(raw)
    s = raw.decode('utf8')
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # ---- 分项拆账 ----
    uri_re = re.compile(r'data:image/[a-z]+;base64,[A-Za-z0-9+/=]+')
    all_uris = uri_re.findall(s)

    hero_m = re.search(r'background-image:url\("(data:image/[a-z]+;base64,[^"]+)"\)', s)
    hero = len(hero_m.group(1)) if hero_m else 0

    def grab(varname):
        m = re.search(r'const ' + varname + r'=(\{.*?\});\n', s, re.S)
        return json.loads(m.group(1)) if m else {}

    art = grab('ART')
    end_art = grab('END_ART')
    base_keys = ('catB0', 'catB1')
    role = sum(len(v) for k, v in art.items() if k in base_keys)
    diff_keys = [k for k in art if re.match(r'^catB[2-9]', k)]
    diff = sum(len(v) for k, v in art.items() if k in diff_keys)
    goods_keys = [k for k in art if k.startswith('g_')]
    goods = sum(len(v) for k, v in art.items() if k in goods_keys)
    scene_keys = [k for k in art if k.startswith('scene')]
    scene = sum(len(v) for k, v in art.items() if k in scene_keys)
    card = sum(len(v) for k, v in art.items()
               if k not in base_keys and k not in scene_keys
               and k not in diff_keys and k not in goods_keys)
    end_bytes = sum(len(v) for v in end_art.values())
    # 「其余」= 总字节 − 七项素材，八项严格加总 = total（含 HTML/CSS/JS 与 JSON 结构开销）
    other = total - hero - end_bytes - role - diff - goods - scene - card

    parts = [
        ('主页 Hero', hero, SOFT['hero']),
        ('结局插画 ×%d' % len(end_art), end_bytes, SOFT['end_art']),
        ('基础角色层 ×2', role, SOFT['role']),
        ('角色差分 ×%d' % len(diff_keys), diff, SOFT['diff']),
        ('物资卡 ×%d' % len(goods_keys), goods, SOFT['goods']),
        ('档案卡面 ×%d' % (len(art) - 2 - len(scene_keys) - len(diff_keys) - len(goods_keys)), card, SOFT['card']),
        ('幕间插画 ×%d' % len(scene_keys), scene, SOFT['scene']),
        ('HTML/CSS/JS + 结构', other, SOFT['skeleton']),
    ]

    # ---- 硬校验 ----
    checks = []

    def ck(name, ok, detail=''):
        checks.append((name, bool(ok), detail))

    ck('总产物 ≤ %d KiB' % TOTAL_LIMIT, total <= TOTAL_LIMIT * 1024,
       '%.1f KiB' % kib(total))
    ck('无外链图片（离线可玩）', not re.search(r'src="https?://', s), '')
    ck('占位符已全部注入', not any(x in s for x in
       ['__HERO__', '__ART__', '__END_ART__', '__BUILD__']), '')
    ck('发布版本标记已写入', bool(re.search(r'v1\.0\.0\+\d{8}', s)),
       (re.search(r'v(1\.0\.0\+\d{8})', s) or [None, '缺失'])[1])
    ck('11 张结局插画齐全', all(i in end_art for i in END_IDS),
       '%d/11' % sum(1 for i in END_IDS if i in end_art))
    ck('透明角色层 B0/B1 齐全', all(k in art for k in ('catB0', 'catB1')), '')
    ck('三幕幕间插画齐全', all(k in art for k in ('scene1', 'scene2', 'scene3')),
       '%d/3' % sum(1 for k in ('scene1', 'scene2', 'scene3') if k in art))
    diff_ids = ('catB2', 'catB3', 'catB4', 'catB5')
    ck('四张角色差分齐全', all(k in art for k in diff_ids),
       '%d/4' % sum(1 for k in diff_ids if k in art))
    # 差分必须是真透明层，不能是带绿幕的不透明图
    try:
        import io as _io
        from PIL import Image as _Image
        def _alpha(v):
            im = _Image.open(_io.BytesIO(__import__('base64').b64decode(v.split(',', 1)[1])))
            return im.mode in ('RGBA', 'LA') or 'transparency' in im.info
        ck('角色差分均带 alpha 通道', all(_alpha(art[k]) for k in diff_ids if k in art),
           '%d/4' % sum(1 for k in diff_ids if k in art and _alpha(art[k])))
    except Exception as ex:
        ck('角色差分均带 alpha 通道', False, str(ex)[:40])
    goods_ids = ['g_food','g_water','g_fuel','g_bag','g_med','g_radio','g_tool']
    ck('七张物资卡齐全', all(k in art for k in goods_ids),
       '%d/7' % sum(1 for k in goods_ids if k in art))
    ck('内嵌图片数 ≥ 14', len(all_uris) >= 14, '%d 张' % len(all_uris))

    # JS 语法（有 node 就验）
    node_ok, node_msg = None, '未运行'
    if subprocess.run(['which', 'node'], capture_output=True).returncode == 0:
        js = '\n'.join(m.group(1) for m in re.finditer(r'<script>([\s\S]*?)</script>', s))
        tmp = '.check_size_syntax.js'
        open(tmp, 'w', encoding='utf8').write(js)
        # 脚本近 400 KiB，不能塞进命令行参数；落临时文件再让 node 读
        r = subprocess.run(['node', '-e',
                            "new Function(require('fs').readFileSync(" + json.dumps(tmp) + ",'utf8'))"],
                           capture_output=True, text=True)
        try: os.remove(tmp)
        except OSError: pass
        node_ok = r.returncode == 0
        node_msg = '通过' if node_ok else r.stderr.strip().split('\n')[0]
        ck('JS 语法', node_ok, node_msg)

    # ---- 增长护栏 ----
    hist = []
    if os.path.exists(HISTORY):
        try:
            hist = json.load(open(HISTORY, encoding='utf8'))
        except Exception:
            hist = []
    # 文案/代码字符数（去掉全部 data URI），用于判断「这次是不是又塞了长文本」
    text_chars = len(uri_re.sub('', s))
    prev_text = hist[-1].get('text_chars') if hist else None
    text_delta = (text_chars - prev_text) if prev_text else None
    prev = hist[-1]['total'] if hist else None
    growth = (total - prev) / prev if prev else None
    growth_note = '首次构建，无基线'
    if growth is not None:
        growth_note = '%+.1f%%（上次 %.1f KiB）' % (growth * 100, kib(prev))
        if growth > GROWTH_WARN:
            print('WARN 相比上次构建增长 %.1f%%，检查是否又塞了整图' % (growth * 100))
    near = total >= WARN_AT * 1024
    if near:
        print('WARN 已达 %.1f KiB ≥ %d KiB 预警线，距硬闸门只剩 %.1f KiB' %
              (kib(total), WARN_AT, kib(TOTAL_LIMIT * 1024 - total)))
    hist.append({'time': now, 'total': total, 'text_chars': text_chars,
                 'parts': {p[0]: p[1] for p in parts}})
    json.dump(hist[-20:], open(HISTORY, 'w', encoding='utf8'), ensure_ascii=False, indent=2)

    # ---- 报告 ----
    lines = [
        '# 构建后体积校验报告',
        '',
        '产物：`%s` · %s · **%.1f KiB / %d KiB**' % (path, now, kib(total), TOTAL_LIMIT),
        '',
        '## 分项拆账',
        '',
        '| 分项 | 实际 | 预算 | 占比 |',
        '|---|---:|---:|---:|',
    ]
    for name, b, budget in parts:
        lines.append('| %s | %.1f KiB | %s | %.1f%% |' %
                     (name, kib(b), ('%d KiB' % budget) if budget else '—', b / total * 100))
    lines += [
        '',
        '## 检查项',
        '',
    ]
    for name, ok, detail in checks:
        lines.append('- %s %s **%s**%s' % ('✓' if ok else '✗', name,
                                        '通过' if ok else '失败',
                                        (' · ' + detail) if detail and detail != '通过' else ''))
    soft_warn = [(n, kib(b), bgt) for n, b, bgt in parts if bgt and b > bgt * 1024]
    for n, v, bgt in soft_warn:
        lines.append('- ⚠ 分项超软预算：**%s %.1f KiB > %d KiB**' % (n, v, bgt))
    if near:
        lines.append('- ⚠ **逼近硬闸门**：%.1f KiB ≥ %d KiB 预警线，剩余 %.1f KiB' %
                     (kib(total), WARN_AT, kib(TOTAL_LIMIT * 1024 - total)))
    bill = asset_bill(art, end_art, hero_m.group(1) if hero_m else '')
    lines += [
        '',
        '## 文案 / 代码增量',
        '',
        '- 去掉全部 data URI 后：%d 字符%s' %
        (text_chars, (' · 相比上次 **%+d 字符**' % text_delta) if text_delta is not None else '（首次，无基线）'),
        '- 口径：HTML + CSS + JS + 文案，不含任何内嵌图片字节',
        '',
        '## 图片资源账单（构建期解码，按内嵌字节降序）',
        '',
        '| 资源 | 格式 | 原始尺寸 | 解码字节 | 内嵌字符 |',
        '|---|---|---:|---:|---:|',
    ]
    for name, fmt, dim, dec, enc in sorted(bill, key=lambda r: -r[4]):
        lines.append('| `%s` | %s | %s | %.1f KiB | %.1f KiB |' %
                     (name, fmt, dim, kib(dec), kib(enc)))
    lines += [
        '',
        '共 **%d 张**内嵌图 · 解码合计 **%.1f KiB** · base64 合计 **%.1f KiB**（含 `data:` 前缀开销）' %
        (len(bill), kib(sum(r[3] for r in bill)), kib(sum(r[4] for r in bill))),
        '',
        '> 下一张新图的预算：先看剩余 %.1f KiB，再按本表同类资源的「内嵌字符」估，' %
        kib(TOTAL_LIMIT * 1024 - total),
        '> 不要拿源 PNG / 源 WebP 的字节数估，必须按 base64 内嵌后的成品算。',
        '',
        '## 增长护栏',
        '',
        '- 阈值：单次构建总增长 > %d%% 报警' % (GROWTH_WARN * 100),
        '- 本次：%s' % growth_note,
        '- 历史记录：`%s`（保留最近 20 次）' % HISTORY,
        '',
        '## 结论',
        '',
    ]
    failed = [n for n, ok, _ in checks if not ok]
    lines.append('**%s** · %d 项硬校验，%d 项失败，%d 项软预算警告。' %
                 ('PASS' if not failed else 'FAIL', len(checks), len(failed), len(soft_warn)))
    open(REPORT, 'w', encoding='utf8').write('\n'.join(lines) + '\n')

    # ---- 控制台 ----
    print('=== 构建后体积校验 ===')
    print('总计 %.1f KiB / %d KiB' % (kib(total), TOTAL_LIMIT))
    for name, b, budget in parts:
        flag = ' ⚠超预算' if budget and b > budget * 1024 else ''
        print('  %-18s %7.1f KiB%s' % (name, kib(b), flag))
    for name, ok, detail in checks:
        print('  %s %s%s' % ('✓' if ok else '✗', name, (' · ' + detail) if detail else ''))
    print('  增长：%s | 文案/代码 %d 字符%s' %
          (growth_note, text_chars,
           (' (%+d)' % text_delta) if text_delta is not None else ''))
    print('  图片账单：%d 张，解码 %.1f KiB / 内嵌 %.1f KiB' %
          (len(bill), kib(sum(r[3] for r in bill)), kib(sum(r[4] for r in bill))))
    print('  报告：%s' % REPORT)
    print('结论：%s' % ('PASS' if not failed else 'FAIL → 构建中止'))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
