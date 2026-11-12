#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""组装上架压缩包：显式白名单选文件，生成预览 / 清单 / SHA256SUMS，打包后读回校验。

刻意不整目录打包 —— 工作区里有大量 patch_*.py、中间截图和提取产物，
上架包只该有交付与复核材料。
"""
import hashlib
import json
import os
import re
import shutil
import zipfile
from datetime import datetime

ROOT = '/data/workspace'
PKG = '极寒末世囤货模拟器_v1.0.0'
STAGE = os.path.join(ROOT, '_release_stage', PKG)
ZIP = os.path.join(ROOT, '极寒末世囤货模拟器_v1.0.0_上架包.zip')
GAME = '极寒末世囤货模拟器_完整版.html'

# 源路径 → 包内相对路径（白名单）
FILES = [
    (GAME, GAME),
    ('README_上架说明.md', 'README_上架说明.md'),
    ('发布说明.md', '发布说明.md'),
    ('素材与版权声明.md', '素材与版权声明.md'),
    ('看板_待办.md', '看板_待办.md'),
    ('发布验收日志.txt', '发布验收日志.txt'),
    ('release_meta.json', '构建元数据.json'),
    ('开发日记_极寒末世囤货模拟器.md', 'docs/开发日记.md'),
    ('体积校验报告.md', 'docs/体积校验报告.md'),
    ('减法账单.md', 'docs/减法账单.md'),
    ('美术生图排期.md', 'docs/美术生图排期.md'),
    ('同类生存囤货游戏调研与优化建议.md', 'docs/同类生存囤货游戏调研与优化建议.md'),
    ('size_history.json', 'docs/体积历史.json'),
    ('build_game.py', 'tools/build_game.py'),
    ('check_size.py', 'tools/check_size.py'),
    ('shrink.py', 'tools/shrink.py'),
    ('browser_check.js', 'tools/browser_check.js'),
    ('make_release.py', 'tools/make_release.py'),
]


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def make_preview(out):
    """三屏预览：主页 / 结算 / 挑战设定，竖排拼接。"""
    from PIL import Image, ImageDraw, ImageFont
    F = '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
    ft = ImageFont.truetype(F, 20, index=0)
    fs = ImageFont.truetype(F, 13, index=0)
    W = 360
    panels = [
        ('01 · 主页 / 今日挑战入口', 'shots/21_home_challenge.png'),
        ('02 · 结算 / 复盘与分享', 'shots/09_result.png'),
        ('03 · 挑战设定 / 三项由种子锁定', 'shots/19_challenge_setup.png'),
    ]
    ims = []
    for label, rel in panels:
        im = Image.open(os.path.join(ROOT, rel)).convert('RGB')
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        ims.append((label, im))
    H = 40 + sum(28 + im.height + 10 for _, im in ims)
    sheet = Image.new('RGB', (W, H), (6, 13, 20))
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), '极寒末世囤货模拟器 v1.0.0 · 上架预览', fill=(255, 211, 107), font=ft)
    y = 40
    for label, im in ims:
        d.text((10, y + 3), label, fill=(143, 227, 255), font=fs)
        y += 28
        sheet.paste(im, (0, y))
        y += im.height + 10
    sheet.save(out, optimize=True)
    return sheet.size


def main():
    if os.path.exists(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE, exist_ok=True)

    missing = [src for src, _ in FILES if not os.path.exists(os.path.join(ROOT, src))]
    if missing:
        raise SystemExit('缺件，中止打包: ' + ', '.join(missing))

    for src, rel in FILES:
        dst = os.path.join(STAGE, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if rel == 'tools/browser_check.js':
            # 工作区版硬编码了 /data/workspace 绝对路径；发布包里改成相对包根 +
            # 可选 CHROME_PATH，否则用户解压后根本跑不起来。工作区原件不动。
            t = open(os.path.join(ROOT, src), encoding='utf8').read()
            t = t.replace("const fs = require('fs');",
                          "const fs = require('fs');\nconst path = require('path');")
            t = t.replace(
                "const URL = 'file:///data/workspace/极寒末世囤货模拟器_完整版.html';",
                "// 发布包适配：相对包根定位产物（工作区版为绝对路径）\n"
                "const URL = 'file://' + path.resolve(__dirname, '..', '极寒末世囤货模拟器_完整版.html');")
            t = t.replace("const OUT = '/data/workspace/shots';",
                          "const OUT = path.resolve(__dirname, '..', '_shots');")
            t = t.replace("executablePath: '/usr/bin/google-chrome-stable',",
                          "executablePath: process.env.CHROME_PATH || undefined,")
            open(dst, 'w', encoding='utf8').write(t)
        else:
            shutil.copy2(os.path.join(ROOT, src), dst)

    # 预览图
    preview = os.path.join(STAGE, '上架预览.png')
    size = make_preview(preview)
    shutil.copy2(preview, os.path.join(ROOT, '上架预览.png'))

    # 产物与校验结论
    game_path = os.path.join(STAGE, GAME)
    meta = json.load(open(os.path.join(ROOT, 'release_meta.json'), encoding='utf8'))
    report = open(os.path.join(ROOT, '体积校验报告.md'), encoding='utf8').read()
    log = open(os.path.join(ROOT, '发布验收日志.txt'), encoding='utf8').read()
    gate_pass = '**PASS**' in report
    gate_n = (re.search(r'(\d+) 项硬校验', report) or [None, '?'])[1]
    stages = len(re.findall(r'^=== 阶段', log, re.M))
    pageerrors = len(re.findall(r'pageerror:', log))
    js_clean = bool(re.search(r'=== JS 错误 ===\s*\n无', log))
    no_external = 'src="https' not in open(game_path, encoding='utf8').read()
    art_count = len(re.findall(r'\| `', report))  # 资源账单行数

    manifest = {
        'name': '极寒末世囤货模拟器',
        'version': meta['version'],
        'build': meta['build'],
        'built_at': meta['built_at'],
        'packaged_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'entry': GAME,
        'entry_bytes': os.path.getsize(game_path),
        'entry_kib': round(os.path.getsize(game_path) / 1024, 1),
        'entry_sha256': sha(game_path),
        'gate': {
            'limit_kib': 600, 'warn_kib': 590,
            'result': 'PASS' if gate_pass else 'FAIL',
            'hard_checks': gate_n,
            'embedded_images': art_count,
            'no_external_src': no_external,
        },
        'regression': {
            'stages': stages, 'pageerrors': pageerrors,
            'js_errors_clean': js_clean, 'raw_log': '发布验收日志.txt'
        },
        'contents': [rel for _, rel in FILES] + ['上架预览.png', '发布清单.json', 'SHA256SUMS'],
        'notes': [
            '只需上传 entry 指向的 HTML；其余为交付与复核材料',
            '不联网 / 无外链 / 无后端 / 不上传用户数据',
            '美术资产版权保留，仅本项目内使用',
            '成绩码校验位防手滑不防作弊；无云端排行榜',
            '剩余 7 条优化冻结在看板_待办.md，未进入 v1.0',
        ],
    }
    open(os.path.join(STAGE, '发布清单.json'), 'w', encoding='utf8').write(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

    # SHA256SUMS：覆盖包内除自身外的全部文件
    sums = []
    for base, _, names in os.walk(STAGE):
        for n in sorted(names):
            if n == 'SHA256SUMS':
                continue
            full = os.path.join(base, n)
            rel = os.path.relpath(full, STAGE).replace(os.sep, '/')
            sums.append((sha(full), rel))
    sums.sort(key=lambda x: x[1])
    open(os.path.join(STAGE, 'SHA256SUMS'), 'w', encoding='utf8').write(
        ''.join('%s  %s\n' % (h, p) for h, p in sums))
    manifest['contents'].sort()

    # 打包
    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _, names in os.walk(STAGE):
            for n in sorted(names):
                full = os.path.join(base, n)
                arc = os.path.join(PKG, os.path.relpath(full, STAGE))
                z.write(full, arc.replace(os.sep, '/'))

    # 读回校验：条目数 + 每个文件的哈希与 SHA256SUMS 一致
    with zipfile.ZipFile(ZIP) as z:
        names = z.namelist()
        sums_map = dict((p, h) for h, p in sums)
        bad = []
        for name in names:
            rel = name[len(PKG) + 1:]
            if rel == 'SHA256SUMS':
                continue
            if rel not in sums_map or hashlib.sha256(z.read(name)).hexdigest() != sums_map[rel]:
                bad.append(rel)
        if bad:
            raise SystemExit('读回校验失败: ' + ', '.join(bad))

    print('=== 上架包 ===')
    print('路径 :', ZIP)
    print('大小 : %.1f KiB' % (os.path.getsize(ZIP) / 1024))
    print('条目 : %d 个文件（读回哈希全部一致）' % len(names))
    print('版本 : %s | 产物 %d B / sha256 %s' %
          (meta['build'], manifest['entry_bytes'], manifest['entry_sha256'][:16] + '…'))
    print('闸门 : %s · %s 项硬校验 · %d 张内嵌图 · 无外链 %s' %
          (manifest['gate']['result'], gate_n, art_count, no_external))
    print('回归 : %d 阶段 · %d 个 pageerror · JS 错误 %s' %
          (stages, pageerrors, '无' if js_clean else '有'))
    print('预览 : %dx%d' % size)
    print('\n包内结构:')
    for n in names:
        print('  ', n)
    return manifest


if __name__ == '__main__':
    main()
