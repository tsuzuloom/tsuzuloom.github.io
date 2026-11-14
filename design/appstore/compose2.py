import asyncio, base64
from playwright.async_api import async_playwright
def b64(n): return base64.b64encode(open(f"ui_{n}.png","rb").read()).decode()
CSS="""*{margin:0;padding:0;box-sizing:border-box}
body{width:1290px;height:2796px;font-family:'Noto Sans CJK JP',sans-serif;overflow:hidden;position:relative}
.brand{position:absolute;top:110px;left:0;right:0;text-align:center;font-size:40px;color:#8A90A0;letter-spacing:6px;font-weight:500}
.cap{position:absolute;top:210px;left:0;right:0;text-align:center;color:#1A1D24}
.t{font-size:104px;font-weight:700;line-height:1.32;letter-spacing:2px;white-space:pre-line}
.s{font-size:46px;color:#5A6070;margin-top:40px;font-weight:500;white-space:pre-line;line-height:1.5}
.ph{position:absolute;border-radius:72px;overflow:hidden;box-shadow:0 40px 90px rgba(20,25,40,0.22);border:10px solid #fff;background:#fff}
.ph img{width:100%;display:block}
.chips{position:absolute;left:60px;right:60px;display:flex;flex-wrap:wrap;justify-content:center;gap:18px}
.chip{font-size:40px;padding:14px 32px;border-radius:40px;background:#fff;color:#2A2F3A;box-shadow:0 6px 16px rgba(20,25,40,0.08);font-weight:500}"""
def single(bg,t,s,img):
    return f"""<html><head><style>{CSS}</style></head><body style="background:{bg}"><div class="brand">Tsuzu Loom</div>
<div class="cap"><div class="t">{t}</div><div class="s">{s}</div></div>
<div class="ph" style="left:115px;top:820px;width:1060px;height:2300px"><img src="data:image/png;base64,{b64(img)}"></div></body></html>"""
def hero():
    return f"""<html><head><style>{CSS}</style></head><body style="background:linear-gradient(180deg,#F3F0E8 0%,#E9EDF5 100%)"><div class="brand">Tsuzu Loom</div>
<div class="cap"><div class="t">執筆も設定も、\nぜんぶひとつに</div><div class="s">増えていく創作を、作品ごとの部屋にまとめる</div></div>
<div class="chips" style="top:760px">{''.join(f'<div class="chip">{x}</div>' for x in ["章・シーン","人物","相関図","家系図","年表","世界観","独自の暦"])}</div>
<div class="ph" style="left:-10px;top:1120px;width:680px;height:1474px;transform:rotate(-5deg);z-index:1"><img src="data:image/png;base64,{b64('write')}"></div>
<div class="ph" style="left:620px;top:1120px;width:680px;height:1474px;transform:rotate(5deg);z-index:1"><img src="data:image/png;base64,{b64('timeline')}"></div>
<div class="ph" style="left:285px;top:1240px;width:720px;height:1561px;z-index:2"><img src="data:image/png;base64,{b64('char')}"></div>
</body></html>"""
PAGES=[
 ("hero",hero()),
 ("scene",single("#EEF1F7","書いているシーンの\n年齢も、すぐわかる","執筆と設定が、ひとつにつながる","scene_edit")),
 ("char",single("#F6EEF1","キャラの設定を、\nひとつの部屋に","プロフィール・能力値・関係をまとめて","char")),
 ("timeline",single("#F5F0E6","年表には、\nその時の年齢まで","シーンも出来事も、時間の順に並ぶ","timeline")),
 ("graph",single("#EEF4EF","関係は、\n線でひと目で","呼び方や想いまで書き込める相関図","graph")),
 ("family",single("#EEF4F5","家系図も、\nつながりから自動で","親・子・夫婦・きょうだい、双子まで","family")),
 ("calendar",single("#F1EEF7","作品だけの\n暦と元号","異世界の暦でも、年齢を自動で計算","calendar")),
]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1290,"height":2796},device_scale_factor=1)
        for i,(n,html) in enumerate(PAGES,1):
            await pg.set_content(html); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f"appstore_{i}_{n}.png")
        await b.close()
asyncio.run(main())
