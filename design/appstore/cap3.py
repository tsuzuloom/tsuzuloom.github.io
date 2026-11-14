import asyncio
from playwright.async_api import async_playwright
OUT="/home/claude/work/shots/ui_"
HIDE="""(()=>{ const el=[...document.querySelectorAll('div')].find(d=>d.children.length<=3&&/デモモード/.test(d.textContent)&&/終了して登録/.test(d.textContent)&&d.textContent.length<40); if(el) el.style.display='none'; return !!el; })()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=await b.new_context(viewport={"width":430,"height":932},device_scale_factor=3,is_mobile=True,has_touch=True,locale="ja-JP")
        pg=await ctx.new_page()
        await pg.add_init_script("localStorage.setItem('tl_intro_v1','1');localStorage.setItem('tl_tlKinds',JSON.stringify({scene:true,event:true,life:true}));localStorage.setItem('tl_charLayout','face');")
        await pg.goto("http://localhost:4173/index.html",wait_until="networkidle")
        await pg.wait_for_timeout(800)
        await pg.get_by_text("登録せずに試す").click(); await pg.wait_for_timeout(800)
        async def tab(label):
            await pg.locator("button:visible").filter(has_text=label).last.click(); await pg.wait_for_timeout(700)
        async def shot(n):
            print(n, await pg.evaluate(HIDE)); await pg.wait_for_timeout(200); await pg.screenshot(path=OUT+n+".png")
        await tab("人物"); await shot("chars")
        await pg.locator("div:visible,button:visible").filter(has_text="水無瀬 縁").last.click(); await pg.wait_for_timeout(800)
        await shot("char")
        await pg.get_by_text("人物一覧").first.click(); await pg.wait_for_timeout(500)
        await tab("関係"); await shot("graph")
        await pg.locator("button:visible").filter(has_text="家系図").first.click(); await pg.wait_for_timeout(900); await shot("family")
        await tab("年表")
        await pg.evaluate("""(()=>{ const t=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('動乱期元年')&&d.children.length===0); if(t){ const sc=t.closest('[style*="overflow-y: auto"]'); sc.scrollTop=t.offsetTop-150; } })()""")
        await pg.wait_for_timeout(400); await shot("timeline")
        await pg.locator("button:visible").filter(has_text="その他").first.click(); await pg.wait_for_timeout(600)
        await pg.locator("button:visible").filter(has_text="暦と元号").first.click(); await pg.wait_for_timeout(800); await shot("calendar")
        await b.close()
asyncio.run(main())
