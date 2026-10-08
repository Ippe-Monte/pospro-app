"""Real-Chromium UI test for POSPRO V2.0.0 with a mocked Supabase (tests/mock-supabase.js).
Run:  python3 tests/ui_test.py [--shots DIR]      exit 1 on any failure."""
import asyncio, base64, io, json, os, sys, threading, http.server, functools, socketserver
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS=sys.argv[sys.argv.index('--shots')+1] if '--shots' in sys.argv else os.path.join(ROOT,'tests','shots')
os.makedirs(SHOTS,exist_ok=True)
MOCK=open(os.path.join(ROOT,'tests','mock-supabase.js'),encoding='utf-8').read()
CFG="window.POSPRO_CONFIG={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'test'};"
results=[]
if not os.path.exists(os.path.join(ROOT,'tests','big-photo.jpg')):
    import subprocess; subprocess.run([sys.executable,os.path.join(ROOT,'tests','make_big_photo.py')],check=True)
def check(name,ok,detail=''):
    results.append((ok,name,detail)); print(('PASS ' if ok else 'FAIL ')+name+(' — '+str(detail) if detail else ''))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        body=None
        if 'assets/js/config.js' in self.path: body=CFG
        elif 'js/vendor/supabase' in self.path: body=MOCK
        if body is None: return super().do_GET()
        b=body.encode('utf-8'); self.send_response(200); self.send_header('Content-Type','application/javascript; charset=utf-8')
        self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
def serve():
    h=functools.partial(Q,directory=ROOT); s=socketserver.TCPServer(('127.0.0.1',0),h); threading.Thread(target=s.serve_forever,daemon=True).start(); return s

async def route(r):
    u=r.request.url
    if u.endswith('sw.js'): return await r.abort()
    if u.startswith('http://127.0.0.1') or u.startswith('data:') or u.startswith('blob:'): return await r.continue_()
    return await r.abort()

AUDIT="""()=>{const de=document.documentElement;const small=[...document.querySelectorAll('body *')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType==3&&n.textContent.trim())).map(e=>[parseFloat(getComputedStyle(e).fontSize),e.textContent.trim().slice(0,20)]).filter(x=>x[0]<11);
 const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return e.offsetParent&&r.width>0&&r.right>innerWidth+1&&!e.closest('.chips')}).map(e=>e.className||e.tagName).slice(0,5);
 return {sw:de.scrollWidth,cw:de.clientWidth,small,over}}"""

async def audit(pg,label):
    a=await pg.evaluate(AUDIT)
    check(f'{label}: no horizontal scroll',a['sw']<=a['cw'],f"{a['sw']}/{a['cw']}")
    check(f'{label}: nothing past the right edge',not a['over'],a['over'])
    check(f'{label}: no text under 11px',not a['small'],a['small'][:3])

async def shot(pg,name): await pg.screenshot(path=os.path.join(SHOTS,name+'.png'))

async def login(pg,email):
    await pg.fill('#liEmail',email); await pg.fill('#liPass','secret123'); await pg.click('#fLogin button[type=submit]')

async def main():
    srv=serve(); base=f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':360,'height':740},device_scale_factor=2,is_mobile=True,has_touch=True)
        await ctx.route('**/*',route)
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto(base); await pg.evaluate('window.__mockReset()'); await pg.reload()
        await pg.wait_for_selector('#fLogin'); await shot(pg,'01-login-360'); await audit(pg,'login 360')

        # owner creates a shop
        await login(pg,'owner@shop.test'); await pg.wait_for_selector('#obCreate'); await shot(pg,'02-onboard-360')
        await pg.click('#obCreate'); await pg.fill('#csName','แก้วหลงกรุง'); await pg.click('#csGo')
        await pg.wait_for_selector('[data-go=setup]'); await pg.click('[data-go=setup]')
        await pg.wait_for_selector('.steps'); await pg.wait_for_timeout(200)
        await shot(pg,'03-home-checklist-360'); await audit(pg,'home 360')
        nav=await pg.evaluate("[...document.querySelectorAll('.bottomnav button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())")
        check('phone bottom nav = 4 main items for owner',nav==['ขาย','โต๊ะ','ครัว','สรุปวันนี้'],nav)
        hdr=await pg.evaluate("(()=>{const r=document.querySelector('.top').getBoundingClientRect();return [r.top,r.height]})()")
        check('header is one 60px row',hdr==[0,60],hdr)

        # category + option group
        await pg.click('.steps [data-go=menu][data-tab=cats]'); await pg.wait_for_selector('#emptyAddCat')
        await pg.click('#emptyAddCat'); await pg.fill('#ceName','ก๋วยเตี๋ยว'); await pg.click('#ceSave'); await pg.wait_for_selector('[data-addgroup]')
        await pg.click('[data-addgroup]'); await pg.fill('#geName','เพิ่มเติม'); await pg.fill('#geChoices','ไม่ใส่ผัก\nเพิ่มหมู (+10)\nเพิ่มกุ้ง +15'); await pg.click('#geSave')
        await pg.wait_for_selector('[data-group]')
        ch=await pg.evaluate("window.__DB.option_groups[0].choices")
        check('option choices parsed with prices',ch==[{'name':'ไม่ใส่ผัก','price':0},{'name':'เพิ่มหมู','price':10},{'name':'เพิ่มกุ้ง','price':15}],ch)
        await shot(pg,'04-menu-categories-360'); await audit(pg,'categories 360')

        # product with a 13 MB, 6000x4500 photo
        await pg.click('[data-tab=items]'); await pg.wait_for_selector('#emptyAddProd'); await pg.click('#emptyAddProd')
        async with pg.expect_file_chooser() as fc: await pg.click('#pePhoto')
        await (await fc.value).set_files(os.path.join(ROOT,'tests','big-photo.jpg'))
        await pg.wait_for_selector('.cropper [data-a=ok]:not([disabled])',timeout=15000); await pg.wait_for_timeout(300)
        await shot(pg,'05-cropper-360')
        await pg.click('.cropper [data-a=ok]')
        await pg.wait_for_function("document.querySelector('#peInfo').textContent.includes('KB')",timeout=15000)
        info=await pg.text_content('#peInfo'); check('photo shrunk before upload (info shows KB)', 'KB' in info, info)
        await pg.fill('#peName','หมูต้มยำพิเศษ'); await pg.fill('#pePrice','60'); await shot(pg,'06-product-editor-360')
        await pg.click('#peSave'); await pg.wait_for_selector('.ptile',timeout=10000)
        up=await pg.evaluate("window.__DB.uploads.slice(-1)[0]")
        check('uploaded file is a JPEG under 400 KB',up and up['type']=='image/jpeg' and up['size']<=400*1024,up)
        dims=await pg.evaluate("""new Promise(r=>{const p=window.__DB.products[0];const i=new Image();i.onload=()=>r([i.naturalWidth,i.naturalHeight,p.image_path]);i.src=window.__DB.objects[p.image_path]})""")
        check('stored photo is 800x600 and the path is saved on the product',dims[0]==800 and dims[1]==600 and dims[2].endswith('.jpg') and '/products/' in dims[2],dims)
        await shot(pg,'07-menu-grid-360'); await audit(pg,'menu grid 360')

        # refresh: the photo must still be there (V1 bug)
        await pg.reload(); await pg.wait_for_selector('.bottomnav'); await pg.click('#btnMe'); await pg.wait_for_selector('[data-mi]')
        await shot(pg,'08-profile-360'); await audit(pg,'profile 360')
        await pg.click('[data-mi="0.1"]'); await pg.wait_for_selector('.ptile')
        bg=await pg.evaluate("getComputedStyle(document.querySelector('.ptile .ph')).backgroundImage.slice(0,30)")
        check('after reload the product tile still shows the photo',bg.startswith('url("data:image/jpeg'),bg)
        back=await pg.evaluate("getComputedStyle(document.querySelector('#btnBack')).display")
        check('phone: menu is a sub-page with Back button',back!='none',back)

        # replace photo -> old file removed
        old=dims[2]
        await pg.click('.ptile'); await pg.wait_for_selector('#pePhoto')
        async with pg.expect_file_chooser() as fc: await pg.click('#pePhoto')
        await (await fc.value).set_files(os.path.join(ROOT,'icons','icon-512.png'))
        await pg.wait_for_selector('.cropper [data-a=ok]:not([disabled])'); await pg.click('.cropper [data-a=ok]')
        await pg.wait_for_function("document.querySelector('#peInfo').textContent.includes('KB')"); await pg.click('#peSave'); await pg.wait_for_timeout(600)
        st=await pg.evaluate(f"[Object.keys(window.__DB.objects).length, {json.dumps(old)} in window.__DB.objects, window.__DB.products[0].image_path!=={json.dumps(old)}]")
        check('replacing a photo deletes the old file',st==[1,False,True],st)

        # cashier joins -> pending -> owner approves
        await pg.click('#btnMe'); await pg.wait_for_selector('#btnOut'); await pg.click('#btnOut'); await pg.click('.sheet [data-ok]')
        await pg.wait_for_selector('#fLogin'); await login(pg,'cash@shop.test'); await pg.wait_for_selector('#obJoin')
        await pg.click('#obJoin'); await pg.fill('#jsCode','7f3a9c21'); await pg.click('#jsGo'); await pg.wait_for_selector('#pdRe')
        await shot(pg,'09-pending-360')
        cnt=await pg.evaluate("window.__DB.shop_members.filter(m=>m.status==='pending').length"); check('join request stored as pending',cnt==1,cnt)
        await pg.click('#pdOut'); await pg.wait_for_selector('#fLogin'); await login(pg,'owner@shop.test'); await pg.wait_for_selector('.bottomnav')
        await pg.click('#btnMe'); await pg.wait_for_selector('[data-mi]'); await pg.click('[data-mi="2.0"]'); await pg.wait_for_selector('[data-user]')
        await shot(pg,'10-staff-360'); await audit(pg,'staff 360')
        await pg.click('[data-user="u-cash"]'); await pg.click('#mSave'); await pg.wait_for_timeout(400)
        mem=await pg.evaluate("window.__DB.shop_members.find(m=>m.user_id==='u-cash')"); check('owner approved cashier',mem['status']=='active' and mem['role']=='cashier',mem)
        await pg.click('#btnMe'); await pg.wait_for_selector('#btnOut'); await pg.click('#btnOut'); await pg.click('.sheet [data-ok]')
        await pg.wait_for_selector('#fLogin'); await login(pg,'cash@shop.test'); await pg.wait_for_selector('.bottomnav')
        await pg.wait_for_timeout(300)
        await pg.click('#btnMe'); await pg.wait_for_selector('#btnOut')
        items=await pg.evaluate("[...document.querySelectorAll('[data-mi] .t')].map(e=>e.textContent)")
        check('cashier menu hides owner-only items',all(x not in items for x in ['เมนูและสินค้า','พนักงานและสิทธิ์','ตั้งค่าร้าน · พร้อมเพย์ · ใบเสร็จ']),items)
        await pg.evaluate("go('menu')"); await pg.wait_for_timeout(300)
        h1=await pg.text_content('.pagehead h1'); check('cashier cannot open the menu editor page',h1!='เมนูและสินค้า',h1)
        await shot(pg,'11-cashier-home-360')

        # tablet landscape: rail, no back button on rail pages
        tab=await b.new_context(viewport={'width':1024,'height':768},device_scale_factor=2); await tab.route('**/*',route)
        tp=await tab.new_page(); tp.on('pageerror',lambda e:errs.append(str(e)))
        await tp.goto(base); await tp.evaluate('window.__mockReset()'); await tp.reload(); await tp.wait_for_selector('#fLogin')
        # reuse state: seed by logging in owner on a fresh db and creating a shop + product quickly
        await login(tp,'owner@shop.test'); await tp.wait_for_selector('#obCreate'); await tp.click('#obCreate'); await tp.fill('#csName','แก้วหลงกรุง'); await tp.click('#csGo'); await tp.wait_for_selector('[data-go=setup]')
        rail=await tp.evaluate("[...document.querySelectorAll('.rail button')].map(b=>b.textContent.trim())")
        check('tablet rail shows main + menu/staff/more',rail==['ขาย','โต๊ะ','ครัว','สรุปวันนี้','เมนู','พนักงาน','เพิ่มเติม'],rail)
        bn=await tp.evaluate("getComputedStyle(document.querySelector('.bottomnav')).display"); check('tablet hides bottom nav',bn=='none',bn)
        await shot(tp,'12-home-1024'); await audit(tp,'home 1024')
        await tp.click('.rail [data-nav=menu]'); await tp.wait_for_selector('#emptyAddProd')
        bk=await tp.evaluate("getComputedStyle(document.querySelector('#btnBack')).display"); check('tablet: menu opened from rail has no Back button',bk=='none',bk)
        await tp.click('#emptyAddProd'); await tp.wait_for_selector('#pePhoto'); await tp.wait_for_timeout(2600); await shot(tp,'13-product-editor-1024')
        check('no JavaScript errors',not errs,errs[:3])
        await b.close()
    srv.shutdown()
    bad=[r for r in results if not r[0]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
