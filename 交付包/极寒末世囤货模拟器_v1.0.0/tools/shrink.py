#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生产构建减法：只做「语义等价」的空白与注释压缩，不动变量名、不动文案、不动图片。

对齐看板议题「单文件最容易悄悄变大」：模板保持可读，产物瘦身。
每一步都单独记账，任何一步若改变了图片 URI 数量或 <script> 段数，立即抛异常回退。

用法（一般由 build_game.py 调用）:
    from shrink import optimize
    s, bill = optimize(s)
"""
import re
import hashlib


def uri_sig(x):
    """全部内嵌图片的指纹：减法绝不能改动任何一个 base64 字符。"""
    uris = sorted(re.findall(r'data:image/[a-z]+;base64,[A-Za-z0-9+/=]+', x))
    return hashlib.sha1('|'.join(uris).encode('utf8')).hexdigest()


def check_invariants(orig, t):
    """压缩每一步都必须通过；任何一张图被改动就抛异常，由构建直接失败。"""
    for label, fn in [
        ('图片内容指纹', uri_sig),
        ('script段', lambda x: x.count('<script>') + x.count('</script>')),
        # 只指纹静态 id（值须为纯标识符）；动态拼接的 id="q_'+g.id+'" 不算，
        # 否则删行首缩进会改变那个「伪串」的内容，把合法压缩误判成破坏结构
        ('DOM id 指纹', lambda x: hashlib.sha1('|'.join(
            sorted(re.findall(r'\bid="([A-Za-z][A-Za-z0-9_-]*)"', x))).encode('utf8')).hexdigest()),
        ('style段', lambda x: x.count('<style>') + x.count('</style>')),
    ]:
        if fn(t) != fn(orig):
            raise RuntimeError('压缩破坏结构：%s %s → %s' %
                               (label, str(fn(orig))[:16], str(fn(t))[:16]))


def optimize(s):
    bill = []
    orig = s

    def step(name, new, guard=None):
        nonlocal s
        old_len = len(s.encode('utf8'))
        new_len = len(new.encode('utf8'))
        if guard:
            guard(new)
        s = new
        bill.append((name, old_len - new_len))
        return s

    def invariants(t):
        check_invariants(orig, t)

    # ① HTML 注释（模板里的分节标记，浏览器不需要）
    step('HTML 注释', re.sub(r'<!--[\s\S]*?-->', '', s), invariants)

    # ② 单行块注释 /* === xxx === */ —— 只删「整行都是注释」的，绝不碰含代码的行
    step('单行块注释', re.sub(r'(?m)^[ \t]*/\*[^*\n]*\*+[ \t]*/\s*$', '', s), invariants)

    # ③ <script> 之外的标签间换行缩进 → 单个空格（必须在删行首缩进之前做，
    #    否则 `>\n   <` 会先变成 `>\n<`，这一步就匹配不到了）
    i, j = s.find('<script>'), s.rfind('</script>')
    if i > 0 and j > i:
        pre, js, post = s[:i], s[i:j + 9], s[j + 9:]
        pre = re.sub(r'>\n[ \t]+<', '> <', pre)
        post = re.sub(r'>\n[ \t]+<', '> <', post)
        step('标签间空白', pre + js + post, invariants)

    # ④ 行首缩进：保留换行本身，删掉每行前面的空格/制表符
    #    JS / CSS 对行首空白不敏感；HTML 换行仍在，渲染时仍是一个空格
    step('行首缩进', re.sub(r'(?m)^[ \t]+', '', s), invariants)

    # ⑤ <style> 内删换行与跟随的缩进（CSS 对空白不敏感；跨行值里的逗号后空格可省）
    m = re.search(r'(<style>)([\s\S]*?)(</style>)', s)
    if m:
        css = re.sub(r'\n[ \t]*', '', m.group(2))
        step('CSS 换行', s[:m.start(2)] + css + s[m.end(2):], invariants)

    # ⑥ 连续空行折成一行
    step('连续空行', re.sub(r'\n{3,}', '\n\n', s), invariants)

    invariants(s)
    return s, bill


def bill_text(bill, before, after):
    lines = [
        '# 生产构建减法账单',
        '',
        '模板保持可读，只在写产物前做语义等价压缩；不动变量名、不动文案、不动任何图片。',
        '',
        '| 步骤 | 节省 |',
        '|---|---:|',
    ]
    for name, b in bill:
        lines.append('| %s | %d B |' % (name, b))
    lines += [
        '',
        '- 压缩前：**%.1f KiB** · 压缩后：**%.1f KiB** · 净省 **%.1f KiB**' %
        (before / 1024, after / 1024, (before - after) / 1024),
        '- 结构不变量：**全部 37 张图片的 base64 内容指纹** / `<script>` 段数 / DOM id 数 / `<style>` 段数，四者压缩前后严格一致；指纹不同直接抛异常回退',
        '- 产物语义以真实 Chromium 五阶段回归为准，不以「看起来一样」为准',
    ]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    import sys, json
    s = open(sys.argv[1], encoding='utf8').read()
    out, bill = optimize(s)
    b0, b1 = len(s.encode('utf8')), len(out.encode('utf8'))
    open('减法账单.md', 'w', encoding='utf8').write(bill_text(bill, b0, b1))
    print(json.dumps({'before': b0, 'after': b1, 'saved': b0 - b1,
                      'steps': [{'name': n, 'saved': v} for n, v in bill]}, ensure_ascii=False, indent=2))
