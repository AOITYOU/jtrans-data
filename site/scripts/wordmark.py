"""トップページのロゴタイプ（All Japanese Translate）を生成して src/index.html に書き込む。

字形は円と直線だけで組む：x-height 100 / cap 140 / 線の太さ 24 / 丸は中心線の半径 38 の同じ円。
e・r・s・J の切り口は紋の構築線と同じ 30°・150° の軸に合わせる。
構築線（円・縦の軸・30°の軸）は無限に伸ばし、紋の円の内側は ui.js がマスクで抜く。

使い方: pip install shapely && python3 scripts/wordmark.py
"""
import math, json, sys
from shapely.geometry import LineString, Polygon, box, Point
from shapely.ops import unary_union
from shapely import affinity

X, C, D, W = 100.0, 140.0, -46.0, 24.0
R = X/2 - W/2          # 中心線の半径 (38)
GAP, SPACE = 15.0, 46.0

def arc(cx, cy, r, a0, a1, n=96):
    pts=[]
    for i in range(n+1):
        a=math.radians(a0+(a1-a0)*i/n); pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    return LineString(pts)
def stroke(line, join=2): return line.buffer(W/2, cap_style=2, join_style=join, mitre_limit=10, quad_segs=24)
def seg(*pts): return LineString(pts)

# 各グリフ：(図形, 構築情報) を返す。構築情報 = circles[(cx,cy,r)], vlines[x], hlines[y], axes[(x1,y1,x2,y2)]
def g_l():
    return stroke(seg((W/2,0),(W/2,C))), dict(circles=[], vlines=[W/2])
def g_A():
    cx=64.0; half=46.0     # 中心線の足の半値幅
    k=(C)/(half)           # 傾き
    ext=30
    L=(cx-half-ext/k, -ext); Rt=(cx+half+ext/k, -ext); apex=(cx, C)
    legs=LineString([L,apex,Rt]).buffer(W/2, cap_style=2, join_style=2, mitre_limit=10)
    legs=legs.intersection(box(-100,0,300,C))
    bar=stroke(seg((cx-60,0.34*C),(cx+60,0.34*C))).intersection(legs.convex_hull)
    return unary_union([legs,bar]), dict(circles=[], vlines=[cx], axes=[(L[0],L[1],apex[0],apex[1]),(Rt[0],Rt[1],apex[0],apex[1])])
def g_J():
    r=R; cy=X/2; sx=2*r+W/2+0.0
    hook=arc(sx-r, cy, r, 0, -150)
    stem=seg((sx,C),(sx,cy))
    return unary_union([stroke(stem),stroke(hook)]), dict(circles=[(sx-r,cy,r)], vlines=[sx], rays=[(sx-r,cy,-150)])
def g_a():
    cx=W/2+R
    return unary_union([stroke(arc(cx,X/2,R,0,360,160)), stroke(seg((cx+R,0),(cx+R,X)))]), dict(circles=[(cx,X/2,R)], vlines=[cx+R])
def g_p():
    cx=W/2+R
    return unary_union([stroke(arc(cx,X/2,R,0,360,160)), stroke(seg((W/2,D),(W/2,X)))]), dict(circles=[(cx,X/2,R)], vlines=[W/2])
def g_n():
    cx=W/2+R
    return unary_union([stroke(seg((W/2,0),(W/2,X))), stroke(arc(cx,X/2,R,180,0)), stroke(seg((cx+R,X/2),(cx+R,0)))]), dict(circles=[(cx,X/2,R)], vlines=[W/2,cx+R])
def g_e():
    cx=W/2+R
    ring=stroke(arc(cx,X/2,R,0,330,140))
    bar=stroke(seg((cx-R,X/2),(cx+R+W/2,X/2)))
    return unary_union([ring,bar]), dict(circles=[(cx,X/2,R)], vlines=[], rays=[(cx,X/2,-30)])
def g_s():
    rt, rb = 17.0, 21.0
    cx = 0.0
    top_c=(cx, X-W/2-rt); bot_c=(cx, W/2+rb)
    a1=arc(top_c[0],top_c[1],rt,30,270,80)
    a2=arc(bot_c[0],bot_c[1],rb,90,-150,80)
    spine=LineString(list(a1.coords)+list(a2.coords)[1:])
    sx=1.45
    spine=affinity.scale(spine, xfact=sx, yfact=1, origin=(0,0))
    g=stroke(spine, join=1)
    minx=g.bounds[0]; g=affinity.translate(g, -minx, 0)
    off=-minx
    circ=[(cx*sx+off, top_c[1], rt, sx), (cx*sx+off, bot_c[1], rb, sx)]
    return g, dict(circles=[], ellipses=circ, vlines=[])
def g_T():
    w=116.0
    return unary_union([stroke(seg((0,C-W/2),(w,C-W/2))), stroke(seg((w/2,0),(w/2,C-W/2)))]), dict(circles=[], vlines=[w/2])
def g_r():
    cx=W/2+R
    return unary_union([stroke(seg((W/2,0),(W/2,X))), stroke(arc(cx,X/2,R,180,30,60))]), dict(circles=[(cx,X/2,R)], vlines=[W/2], rays=[(cx,X/2,30)])
def g_t():
    bar=60.0; sx=bar/2   # 横棒は縦線を中心に左右対称
    return unary_union([stroke(seg((sx,0),(sx,C-16))), stroke(seg((0,X-W/2),(bar,X-W/2)))]), dict(circles=[], vlines=[sx])

G={'A':g_A,'l':g_l,'J':g_J,'a':g_a,'p':g_p,'n':g_n,'e':g_e,'s':g_s,'T':g_T,'r':g_r,'t':g_t}
# 字間の調整（インク間の距離）。丸い字の隣は少し詰める
KERN={('A','l'):2,('T','r'):-14,('l','a'):0,('J','a'):0,('r','a'):-4,('t','e'):-4,('l','l'):2}

def build(text):
    x=0.0; shapes=[]; cons=[]; prev=None
    for ch in text:
        if ch==' ': x+=SPACE; prev=None; continue
        g,info=G[ch]()
        minx,_,maxx,_=g.bounds
        if prev is not None: x+=GAP+KERN.get((prev,ch),0)
        dx=x-minx
        shapes.append(affinity.translate(g,dx,0))
        info=dict(info); info['dx']=dx; cons.append(info)
        x=dx+maxx; prev=ch
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
html = pathlib.Path(__file__).resolve().parent.parent / "src" / "index.html"
s = html.read_text(encoding="utf-8")
a = s.index('<svg class="wordmark'); b = s.index("</svg>", a) + 6
html.write_text(s[:a] + svg + s[b:], encoding="utf-8")
print("wordmark:", len(svg), "bytes")
