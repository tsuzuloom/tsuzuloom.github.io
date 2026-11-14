import asyncio, base64
from playwright.async_api import async_playwright
SHOTS=[
 ("char","キャラの設定を、\nひとつの部屋に","プロフィール・能力値・関係をまとめて","#EEF1F7"),
 ("graph","関係は、\n線でひと目で","呼び方や想いまで書き込める相関図","#F6EEF1"),
 ("family","家系図も、\nつながりから自動で","親・子・夫婦・きょうだいを登録するだけ","#EEF4EF"),
 ("timeline","年表には、\nその時の年齢まで","シーンも出来事も、時間の順に並ぶ","#F5F0E6"),
 ("calendar","作品だけの\n暦と元号","異世界の暦でも、年齢を自動で計算","#F1EEF7"),
 ("chars","作品ごとに、\nキャラをずらりと","名前・生まれ順・自由項目で並べ替え","#EEF4F5"),
]
TPL="""<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1290px;height:2796px;background:%(bg)s;font-family:'Noto Sans CJK JP',sans-serif;overflow:hidden;position:relative}
.cap{position:absolute;top:210px;left:0;right:0;text-align:center;color:#1A1D24}
.t{font-size:104px;font-weight:700;line-height:1.32;letter-spacing:2px;white-space:pre-line}
.s{font-size:46px;color:#5A6070;margin-top:40px;font-weight:500}
.ph{position:absolute;left:115px;top:820px;width:1060px;height:2300px;border-radius:72px;overflow:hidden;box-shadow:0 40px 90px rgba(20,25,40,0.22);border:10px solid #fff;background:#fff}
.ph img{width:100%%;display:block}
.brand{position:absolute;top:110px;left:0;right:0;text-align:center;font-size:40px;color:#8A90A0;letter-spacing:6px;font-weight:500}
</style></head><body>
<div class="brand">Tsuzu Loom</div>
<div class="cap"><div class="t">%(t)s</div><div class="s">%(s)s</div></div>
<div class="ph"><img src="data:image/png;base64,%(img)s"></div>
</body></html>"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1290,"height":2796},device_scale_factor=1)
        for i,(n,t,s,bg) in enumerate(SHOTS,1):
            img=base64.b64encode(open(f"ui_{n}.png","rb").read()).decode()
            await pg.set_content(TPL%{"bg":bg,"t":t,"s":s,"img":img})
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f"appstore_{i}_{n}.png")
        await b.close()
asyncio.run(main())
