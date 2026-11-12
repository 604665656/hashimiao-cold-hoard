# -*- coding: utf-8 -*-
"""极寒末世囤货模拟器 · 上架产物静态校验（只读，不改动源文件）。

用法： python tools/verify.py [入口 HTML 路径]
默认校验仓库根目录 index.html；也可传入 toy/index.html 或桌面原始成品。
"""
import hashlib
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join(ROOT, "index.html")
EXPECT_SHA16 = "defa258d117462ed"
EXPECT_BYTES = 612236


def main():
    p = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    raw = open(p, "rb").read()
    h = raw.decode("utf-8", "replace")
    sha = hashlib.sha256(raw).hexdigest()
    m = re.search(r"<title[^>]*>(.*?)</title>", h, re.S | re.I)
    title = m.group(1).strip() if m else ""

    checks = [
        ("体积 < 1MiB 硬闸门", len(raw) < 1048576),
        ("体积 = 612236 B", len(raw) == EXPECT_BYTES),
        ("SHA256 前 16 位 = defa258d117462ed", sha[:16] == EXPECT_SHA16),
        ("标题含「极寒末世」", "极寒末世" in title),
        ("无 script[src]", len(re.findall(r"<script[^>]*\bsrc=", h, re.I)) == 0),
        ("无 link stylesheet", len(re.findall(r"<link[^>]*stylesheet", h, re.I)) == 0),
        ("无 http(s) src/href", len(re.findall(r'(?:src|href)\s*=\s*["\']https?://', h, re.I)) == 0),
        ("零 fetch(", h.count("fetch(") == 0),
        ("零 XMLHttpRequest", h.count("XMLHttpRequest") == 0),
        ("script 标签配对", h.count("<script") == h.count("</script>")),
        ("style 标签配对", h.count("<style") == h.count("</style>")),
        ("内嵌素材 37 张", h.count("data:image") == 37),
        ("11 结局判定 resolveEnding", "resolveEnding" in h),
        ("成绩码 HSM1-", "HSM1-" in h),
        ("每日挑战 HSMS1-", "HSMS1-" in h),
        ("结局图鉴", "结局图鉴" in h),
        ("Canvas 成绩卡", "getContext" in h and "成绩卡" in h),
        ("本机存档 localStorage", h.count("localStorage") >= 3),
        ("HTML 闭合", "</html>" in h.lower()),
    ]

    print("校验目标:", p)
    print("体积 %d B / sha256 %s / title %s" % (len(raw), sha[:16], title))
    print("-" * 60)
    for name, ok in checks:
        print(("  PASS  " if ok else "  FAIL  ") + name)
    bad = [n for n, ok in checks if not ok]
    print("-" * 60)
    print("%d/%d PASS" % (len(checks) - len(bad), len(checks)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
