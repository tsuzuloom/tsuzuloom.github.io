import asyncio
from playwright.async_api import async_playwright
OUT="/home/claude/work/shots/ui_"
HIDE="""(()=>{ const el=[...document.querySelectorAll('div')].find(d=>d.children.length<=3&&/デモモード/.test(d.textContent)&&/終了して登録/.test(d.textContent)&&d.textContent.length<40); if(el) el.style.display='none'; return !!el; })()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=await b.new_context(viewport={"width":430,"height":932},device_scale_factor=3,is_mobile=True,has_touch=True,locale="ja-JP")
        pg=await ctx.new_page()
        await pg.add_init_script("localStorage.setItem('tl_intro_v1','1');localStorage.setItem('tl_charLayout','face');")
        await pg.goto("http://localhost:4173/index.html",wait_until="networkidle"); await pg.wait_for_timeout(800)
        await pg.get_by_text("登録せずに試す").click(); await pg.wait_for_timeout(800)
        async def shot(n):
            await pg.evaluate(HIDE); await pg.wait_for_timeout(200); await pg.screenshot(path=OUT+n+".png")
        await shot("write")
        await pg.locator("button:visible").filter(has_text="シーン").first.click(); await pg.wait_for_timeout(600); await shot("scenes")
        await pg.locator("div:visible").filter(has_text="薬草街の再会").last.click(); await pg.wait_for_timeout(800); await shot("scene_edit")
        await pg.locator("button:visible").filter(has_text="脚本").last.click(); await pg.wait_for_timeout(500); await shot("scene_script")
        await b.close()
asyncio.run(main())
