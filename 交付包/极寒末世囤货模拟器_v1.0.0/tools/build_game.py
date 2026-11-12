# -*- coding: utf-8 -*-
"""构建单文件游戏：注入档案卡面 / 角色层 / 11 张结局插画 / 主页 Hero"""
import json, re, os, datetime
art=json.load(open('pack/assets.json',encoding='utf8'))
art.pop('silver',None); art.pop('red',None)
# night / white 是旧档案立绘，改由 catB0 + CSS 滤镜表达，不再内嵌（省 55 KiB）
art.pop('night',None); art.pop('white',None)
# R1：9 张事件卡插画替换 archive 网页截图（去水印 / 300×225 / WebP q56）
art.update(json.load(open('art_r1/cards.json',encoding='utf8')))
# R2：3 张三幕幕间插画（16:9 原图偏右裁 x=880..1627 / 360×640 / WebP q42）
art.update(json.load(open('art_r2/scenes.json',encoding='utf8')))
# R3：4 张真实角色差分（绿幕泛洪去背 / 240×240 RGBA WebP q48 / 预模糊）
art.update(json.load(open('art_r3/diffs.json',encoding='utf8')))
# R4：7 张物资卡专图（220×165 / WebP q50），采购清单与门缝交易共用
art.update(json.load(open('art_r4/goods.json',encoding='utf8')))
art['catB0']=json.load(open('cutout_schedule/layer_B0.webp.b64.json',encoding='utf8'))['layer_B0']
art['catB1']=json.load(open('cutout_schedule/layer_B1.webp.b64.json',encoding='utf8'))['layer_B1']
end_art=json.load(open('endings_data.json',encoding='utf8'))
hero=json.load(open('hero_data.json',encoding='utf8'))['hero']
s=open('game_template.html',encoding='utf8').read()
N=[0]
def rep(old,new,tag):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit('FAIL [%s] count=%d'%(tag,n))
    s=s.replace(old,new); N[0]+=1
rep("function face(k){const m={silver:'catB0',red:'catB1'};$('portrait').src=ART[m[k]||k]}",
    "function face(k){const m={silver:'catB0',red:'catB1',night:'catB3',white:'catB2',warm:'catB4',panic:'catB5'};\n const key=m[k]||(/^catB/.test(k)?k:'catB0');\n $('portrait').src=ART[key]||ART.catB0;\n $('portrait').style.filter='';}",'face')
rep("     flags:{burntBooks:0,signalHold:0,metNeighbor:0,commune:0,debt:0,watched:0,relay:0,books:0}};",
    "     flags:{burntBooks:0,signalHold:0,metNeighbor:0,commune:0,debt:0,watched:0,relay:0,books:0},\n     intDone:[],councilDone:[],fastForwarded:false};",'st')
rep(""" if((st.day===10||st.day===25)&&!resume){interlude(st.day===10?1:2,()=>nextDay(true));return}
 if(st.day%7===0&&!resume){council();return}""",
    """ st.intDone=st.intDone||[];st.councilDone=st.councilDone||[];
 if((st.day===10||st.day===25)&&!st.intDone.includes(st.day)){
   st.intDone.push(st.day);saveRun();interlude(st.day===10?1:2,()=>nextDay(true));return}
 if(st.day%7===0&&!st.councilDone.includes(st.day)){
   st.councilDone.push(st.day);saveRun();council();return}""",'节点')
rep(" st.eventIds=st.eventIds||[];st.flags=st.flags||{};",
    " st.eventIds=st.eventIds||[];st.flags=st.flags||{};\n st.intDone=st.intDone||[];st.councilDone=st.councilDone||[];",'续玩')
rep(" $('epilogue').textContent=E.epi;",
    " $('epilogue').textContent=E.text+'\\n\\n— 天气手记 —\\n'+E.epi;",'正文')
rep(""" renderShare();
 say('哈士喵',E.text.replace(/\\n/g,' ').slice(0,110)+'…',()=>{$('next').textContent='— 终 —'});
}""",
    """ renderShare();renderBoard('local');
}""",'旁白')
rep("$('days').oninput=tickSetup;","$('days').oninput=()=>{tickSetup();tickShop()};",'天数')
VERSION='1.0.0'
BUILD=VERSION+'+20261112'
s=s.replace('__BUILD__',BUILD)
s=s.replace('__HERO__',hero).replace('__ART__',json.dumps(art,ensure_ascii=False,separators=(',',':'))).replace('__END_ART__',json.dumps(end_art,ensure_ascii=False,separators=(',',':')))
json.dump({'version':VERSION,'build':BUILD,'built_at':datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')},
          open('release_meta.json','w',encoding='utf8'),ensure_ascii=False,indent=2)
out='极寒末世囤货模拟器_完整版.html'
# 生产构建减法：模板保持可读，写产物前做语义等价压缩（注释 / 缩进 / 空白）
from shrink import optimize, bill_text
raw = s.encode('utf8')
s, bill = optimize(s)
thin = s.encode('utf8')
open('减法账单.md','w',encoding='utf8').write(bill_text(bill, len(raw), len(thin)))
print('减法：%.1f → %.1f KiB，净省 %.1f KiB' %
      (len(raw)/1024, len(thin)/1024, (len(raw)-len(thin))/1024))
open(out,'w',encoding='utf8').write(s)
print('构建完成',N[0],'处 |',out,os.path.getsize(out)//1024,'KB')
# 构建后校验产物体积：失败即中止，不让超预算的单文件悄悄混过去
import sys, subprocess
r=subprocess.run([sys.executable,'check_size.py',out])
if r.returncode!=0:
    print('构建中止：体积校验未通过')
    sys.exit(r.returncode)
