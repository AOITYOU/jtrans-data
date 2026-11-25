"""トップページのロゴタイプ（All Japanese Translate）を生成して src/index.html に書き込む。

字形は円と直線だけで組む：x-height 100 / cap 140 / l 148 / 縦線 24・横線 21 / 丸い字は中心線の半径 40 の同じ円
（上下に2はみ出させて、直線の字と同じ高さに見せる）。字間は左右の形（縦線・丸・斜め・張り出し）で決める。
e・r・s・J の切り口は紋の構築線と同じ 30°・150° の軸に合わせる。
構築線（円・縦の軸・30°の軸）は無限に伸ばし、紋の円の内側は ui.js がマスクで抜く。

使い方: pip install shapely && python3 scripts/wordmark.py
       （試し書き: python3 scripts/wordmark.py --preview /tmp/wm.svg）
"""
import math, json, sys
from shapely.geometry import LineString, Polygon, box, Point
from shapely.ops import unary_union
from shapely import affinity

X, C, D, W = 100.0, 140.0, -46.0, 24.0
ASC = 148.0            # 小文字の l の高さ。大文字より少し高くして、大文字と小文字の区別をつける
HB = 21.0              # 横棒の太さ。横線は同じ太さでも太く見えるので、縦線(24)より細くする
TB = 1.5               # 丸の上下を左右より細くする量（縦の線と横の線の見た目の太さをそろえる）
O = 2.0                # 丸い字のはみ出し（オーバーシュート）。丸は直線より小さく見えるので上下に少し出す
R = X/2 - W/2          # 直線の字の基準半径 (38)
RB = X/2 + O - W/2     # 丸い字の中心線の半径 (40)：外側が -2〜102 になる
SPACE = 46.0
# 字の左右の余白（インクからの距離）。縦線どうしが一番広く、丸・斜め・張り出しの順に詰める
SB = {'stem': 8.0, 'round': 5.5, 'diag': 1.5, 'open': 3.5}

def arc(cx, cy, r, a0, a1, n=96):
    pts=[]
    for i in range(n+1):
        a=math.radians(a0+(a1-a0)*i/n); pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    return LineString(pts)
def stroke(line, join=2): return line.buffer(W/2, cap_style=2, join_style=join, mitre_limit=10, quad_segs=24)
def seg(*pts): return LineString(pts)
def disc(cx, cy, r): return Point(cx, cy).buffer(r, quad_segs=64)
def hbar(x0, x1, y): return box(min(x0,x1), y-HB/2, max(x0,x1), y+HB/2)
def ring(cx, cy, a0=None, a1=None):
    # 丸い字の輪。外側は真円、内側は上下を少しだけ高くした楕円にして、上下の線を細くする
    outer=disc(cx, cy, RB+W/2)
    inner=affinity.scale(disc(cx, cy, RB-W/2), 1.0, (RB-W/2+TB)/(RB-W/2), origin=(cx,cy))
    g=outer.difference(inner)
    if a0 is None: return g
    # 角度 a0→a1（反時計回り）の扇形で切る。切り口は中心から放射状（=30°の軸に沿う）
    n=max(4,int(abs(a1-a0)/3)); big=RB*3
    pts=[(cx,cy)]+[(cx+big*math.cos(math.radians(a0+(a1-a0)*i/n)), cy+big*math.sin(math.radians(a0+(a1-a0)*i/n))) for i in range(n+1)]
    return g.intersection(Polygon(pts))

# 各グリフ：(図形, 構築情報, (左の余白の種類, 右の余白の種類))
# 構築情報 = circles[(cx,cy,r)], vlines[x], rays[(cx,cy,角度)], axes[(x1,y1,x2,y2)]
def g_l():
    return stroke(seg((W/2,0),(W/2,ASC))), dict(vlines=[W/2]), ('stem','stem')
def g_A():
    cx=64.0; half=46.0
    k=C/half; ext=30
    L=(cx-half-ext/k, -ext); Rt=(cx+half+ext/k, -ext); apex=(cx, C)
    legs=LineString([L,apex,Rt]).buffer(W/2, cap_style=2, join_style=2, mitre_limit=10)
    legs=legs.intersection(box(-100,0,300,C))
    bar=hbar(cx-60, cx+60, X/2).intersection(legs.convex_hull)   # 横棒は x-height の半分の線に乗せる
    return unary_union([legs,bar]), dict(vlines=[cx], axes=[(L[0],L[1],apex[0],apex[1]),(Rt[0],Rt[1],apex[0],apex[1])]), ('diag','diag')
def g_J():
    # 払いは丸い字と同じ円。切り口は 240°（30°の軸）で、払いを短めに止める
    cy=X/2; sx=W/2+2*RB
    hook=ring(sx-RB, cy, -120, 0)
    stem=seg((sx,C),(sx,cy))
    return unary_union([stroke(stem),hook]), dict(circles=[(sx-RB,cy,RB)], vlines=[sx], rays=[(sx-RB,cy,-120)]), ('round','stem')
def g_a():
    cx=W/2+RB
    return unary_union([ring(cx,X/2), stroke(seg((cx+RB,0),(cx+RB,X)))]), dict(circles=[(cx,X/2,RB)], vlines=[cx+RB]), ('round','stem')
def g_p():
    cx=W/2+RB
    return unary_union([ring(cx,X/2), stroke(seg((W/2,D),(W/2,X)))]), dict(circles=[(cx,X/2,RB)], vlines=[W/2]), ('stem','round')
def g_n():
    cx=W/2+RB
    return unary_union([stroke(seg((W/2,0),(W/2,X))), ring(cx,X/2,0,180), stroke(seg((cx+RB,X/2),(cx+RB,0)))]), dict(circles=[(cx,X/2,RB)], vlines=[W/2,cx+RB]), ('stem','stem')
def g_e():
    cx=W/2+RB
    bowl=ring(cx,X/2,0,330)
    # 横棒は外側の円で切り、右端の段差をなくす
    bar=hbar(cx-RB, cx+RB+W, X/2).intersection(disc(cx,X/2,RB+W/2))
    return unary_union([bowl,bar]), dict(circles=[(cx,X/2,RB)], rays=[(cx,X/2,-30)]), ('round','round')
def g_s():
    # 上下2つの円をつないだ背骨。下の円を少し大きくして安定させ、横に1.5倍伸ばす
    total=(X+2*O-W)/2
    rt, rb = total*0.465, total*0.535
    top_c=(0.0, X+O-W/2-rt); bot_c=(0.0, -O+W/2+rb)
    a1=arc(top_c[0],top_c[1],rt,30,270,80)
    a2=arc(bot_c[0],bot_c[1],rb,90,-150,80)
    spine=LineString(list(a1.coords)+list(a2.coords)[1:])
    sx=1.5
    spine=affinity.scale(spine, xfact=sx, yfact=1, origin=(0,0))
    g=stroke(spine, join=1)
    off=-g.bounds[0]; g=affinity.translate(g, off, 0)
    return g, dict(ellipses=[(off, top_c[1], rt, sx), (off, bot_c[1], rb, sx)]), ('round','round')
def g_T():
    w=116.0
    return unary_union([hbar(0,w,C-HB/2), stroke(seg((w/2,0),(w/2,C-HB/2)))]), dict(vlines=[w/2]), ('open','open')
def g_r():
    cx=W/2+RB
    return unary_union([stroke(seg((W/2,0),(W/2,X))), ring(cx,X/2,30,180)]), dict(circles=[(cx,X/2,RB)], vlines=[W/2], rays=[(cx,X/2,30)]), ('stem','open')
def g_t():
    bar=60.0; sx=bar/2   # 横棒は縦線を中心に左右対称
    return unary_union([stroke(seg((sx,0),(sx,C-16))), hbar(0,bar,X-HB/2)]), dict(vlines=[sx]), ('open','open')

G={'A':g_A,'l':g_l,'J':g_J,'a':g_a,'p':g_p,'n':g_n,'e':g_e,'s':g_s,'T':g_T,'r':g_r,'t':g_t}
# 個別の字間調整（余白の種類だけでは合わない組み合わせ）
KERN={('T','r'):-9, ('r','a'):-2, ('A','l'):1, ('t','e'):1}

def build(text):
    x=0.0; shapes=[]; cons=[]; prev=None
    for ch in text:
        if ch==' ': x+=SPACE; prev=None; continue
        g,info,(lsb,rsb)=G[ch]()
        minx,_,maxx,_=g.bounds
        if prev is not None: x+=SB[prev[1]]+SB[lsb]+KERN.get((prev[0],ch),0)
        dx=x-minx
        shapes.append(affinity.translate(g,dx,0))
        info=dict(info); info['dx']=dx; cons.append(info)
        x=dx+maxx; prev=(ch,rsb)
    return unary_union(shapes), cons, x

def path_of(geom):
    geom=geom.simplify(0.08, preserve_topology=True)
    polys=[geom] if geom.geom_type=='Polygon' else list(geom.geoms)
    d=[]
    for p in polys:
        for ring in [p.exterior]+list(p.interiors):
            pts=list(ring.coords)
            d.append('M'+' L'.join(f'{px:.1f} {-py:.1f}' for px,py in pts)+'Z')
    return ''.join(d)

text='All Japanese Translate'
geom,cons,width=build(text)
under=[]; over=[]
for c in cons:
    dx=c['dx']
    for (cx,cy,r) in c.get('circles',[]):
        under.append(f'<circle cx="{cx+dx:.1f}" cy="{-cy:.1f}" r="{r+W/2:.1f}"/>')
        over.append(f'<circle cx="{cx+dx:.1f}" cy="{-cy:.1f}" r="{r:.1f}"/>')
    for (cx,cy,r,sx) in c.get('ellipses',[]):
        over.append(f'<ellipse cx="{cx+dx:.1f}" cy="{-cy:.1f}" rx="{r*sx:.1f}" ry="{r:.1f}"/>')
    for vx in c.get('vlines',[]):
        under.append(f'<line x1="{vx+dx:.1f}" y1="{-(C+40):.1f}" x2="{vx+dx:.1f}" y2="{-(D-30):.1f}"/>')
    for (cx,cy,ang) in c.get('rays',[]):
        a=math.radians(ang); L=R+W/2+18
        over.append(f'<line x1="{cx+dx:.1f}" y1="{-cy:.1f}" x2="{cx+dx+L*math.cos(a):.1f}" y2="{-(cy+L*math.sin(a)):.1f}"/>')
    for (x1,y1,x2,y2) in c.get('axes',[]):
        over.append(f'<line x1="{x1+dx:.1f}" y1="{-y1:.1f}" x2="{x2+dx:.1f}" y2="{-y2:.1f}"/>')
struct=dict(circles=[],ellipses=[],vlines=[],rays=[],axes=[])
for c in cons:
    dx=c['dx']
    for (cx,cy,r) in c.get('circles',[]): struct['circles'].append((cx+dx,cy,r))
    for (cx,cy,r,sx) in c.get('ellipses',[]): struct['ellipses'].append((cx+dx,cy,r*sx,r))
    for vx in c.get('vlines',[]): struct['vlines'].append(vx+dx)
    for (cx,cy,a) in c.get('rays',[]): struct['rays'].append((cx+dx,cy,a))
    for (x1,y1,x2,y2) in c.get('axes',[]): struct['axes'].append((x1+dx,y1,x2+dx,y2))
out=dict(width=width, path=path_of(geom), under=''.join(under), over=''.join(over), X=X, C=C, D=D, W=W, R=R, struct=struct)

# ---- SVG ----
d=out; S=d['struct']
C,D,X,Wd,R,Wt=d['C'],d['D'],d['X'],d['width'],d['R'],d['W']
BIG=6000
def inf_line(px,py,ang):
    a=math.radians(ang); dx,dy=math.cos(a)*BIG, math.sin(a)*BIG
    return f'<line x1="{px-dx:.1f}" y1="{-(py-dy):.1f}" x2="{px+dx:.1f}" y2="{-(py+dy):.1f}"/>'
under=[]; over=[]
for (cx,cy,r) in S['circles']:
    under.append(f'<circle cx="{cx:.1f}" cy="{-cy:.1f}" r="{r+Wt/2:.1f}"/>')
    under.append(f'<circle cx="{cx:.1f}" cy="{-cy:.1f}" r="{r-Wt/2:.1f}"/>')
    over.append(f'<circle cx="{cx:.1f}" cy="{-cy:.1f}" r="{r:.1f}"/>')
for (cx,cy,rx,ry) in S['ellipses']:
    over.append(f'<ellipse cx="{cx:.1f}" cy="{-cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}"/>')
for vx in S['vlines']:
    over.append(f'<line x1="{vx:.1f}" y1="-{BIG}" x2="{vx:.1f}" y2="{BIG}"/>')
for (cx,cy,a) in S['rays']:
    over.append(inf_line(cx,cy,a))
for (x1,y1,x2,y2) in S['axes']:
    ang=math.degrees(math.atan2(y2-y1,x2-x1)); over.append(inf_line(x1,y1,ang))
# 縦・横の補助：字の左右端（ステムの外側）
vb=f'0 {-C:.0f} {Wd:.1f} {C-D:.0f}'
svg=(f'<svg class="wordmark is-outline" viewBox="{vb}" data-cap="{C:.0f}" data-x="{X:.0f}" data-desc="{-D:.0f}" aria-hidden="true" focusable="false">'
     f'<defs><clipPath id="wmInside"><use href="#wmGlyphs"/></clipPath>'
     f'<mask id="wmMon" maskUnits="userSpaceOnUse" x="-{BIG}" y="-{BIG}" width="{2*BIG}" height="{2*BIG}"><rect x="-{BIG}" y="-{BIG}" width="{2*BIG}" height="{2*BIG}" fill="#fff"/><circle class="wm-mon-hole" cx="-{BIG}" cy="0" r="0" fill="#000"/></mask></defs>'
     f'<g mask="url(#wmMon)"><g class="wm-under">{"".join(under)}</g>'
     f'<g class="wm-over wm-over-out">{"".join(over)}</g></g>'
     f'<path id="wmGlyphs" class="wm-glyphs" d="{d["path"]}"/>'
     f'<g class="wm-over wm-over-top" clip-path="url(#wmInside)">{"".join(over)}</g></svg>')


import pathlib, re
if len(sys.argv) > 2 and sys.argv[1] == "--preview":
    pathlib.Path(sys.argv[2]).write_text(svg, encoding="utf-8")
    print("preview:", sys.argv[2]); raise SystemExit
html = pathlib.Path(__file__).resolve().parent.parent / "src" / "index.html"
s = html.read_text(encoding="utf-8")
a = s.index('<svg class="wordmark'); b = s.index("</svg>", a) + 6
html.write_text(s[:a] + svg + s[b:], encoding="utf-8")
print("wordmark:", len(svg), "bytes")
