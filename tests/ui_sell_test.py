"""Real-Chromium test of the V2.1 selling flows with the mocked Supabase:
sell (tablet + phone) -> kitchen -> customer QR order -> confirm -> bill (cash / PromptPay, QR decoded) -> summary -> drawer.
Run: python3 tests/ui_sell_test.py      exit 1 on any failure; screenshots in tests/shots/"""
import asyncio, json, os, sys, re
import cv2, numpy as np
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,os.path.join(ROOT,'tests'))
src=open(os.path.join(ROOT,'tests','ui_test.py'),encoding='utf-8').read().split('async def main')[0]
ns={'__file__':os.path.join(ROOT,'tests','ui_test.py'),'__name__':'helpers'}; exec(src,ns)
serve,route,AUDIT,check,results,login=ns['serve'],ns['route'],ns['AUDIT'],ns['check'],ns['results'],ns['login']
SHOTS=os.path.join(ROOT,'tests','shots'); os.makedirs(SHOTS,exist_ok=True)
async def shot(pg,n): await pg.screenshot(path=os.path.join(SHOTS,n+'.png'))
async def audit(pg,label):
    a=await pg.evaluate(AUDIT)
    check(f'{label}: no horizontal scroll',a['sw']<=a['cw'],f"{a['sw']}/{a['cw']}")
    check(f'{label}: nothing past the right edge',not a['over'],a['over'])
    check(f'{label}: no text under 11px',not a['small'],a['small'][:3])

SEED="""(()=>{const db=window.__mockLoad()||window.__DB;const D=window.__DB;const s=D.shops[0];const st=D.stations[0];const id=()=>'id-'+Math.random().toString(36).slice(2,10);
 const c1={id:'cat-noodle',shop_id:s.id,name:'🍜 ก๋วยเตี๋ยว',sort:1},c2={id:'cat-drink',shop_id:s.id,name:'เครื่องดื่ม',sort:2},c3={id:'cat-other',shop_id:s.id,name:'เมนูพิเศษ',sort:3};
 D.categories.push(c1,c2,c3);
 D.option_groups.push({id:'g-noodle',shop_id:s.id,category_id:c1.id,name:'เส้น',required:true,multi:false,choices:[{name:'เส้นเล็ก',price:0},{name:'เส้นใหญ่',price:0}]},
   {id:'g-extra',shop_id:s.id,category_id:c1.id,name:'เพิ่มเติม',required:false,multi:true,choices:[{name:'เพิ่มหมู',price:10},{name:'ไม่ใส่ผัก',price:0}]});
 D.products.push({id:'p-tom',shop_id:s.id,category_id:c1.id,station_id:st.id,name:'หมูต้มยำ',price:50,cost:22,is_available:true,sort:1},
   {id:'p-yen',shop_id:s.id,category_id:c1.id,station_id:st.id,name:'เย็นตาโฟทะเล',price:70,cost:35,is_available:true,sort:2},
   {id:'p-tea',shop_id:s.id,category_id:c2.id,station_id:null,name:'ชาไทยเย็น',price:25,cost:11,is_available:true,sort:1},
   {id:'p-water',shop_id:s.id,category_id:c2.id,station_id:null,name:'น้ำเปล่า',price:10,cost:4,is_available:true,sort:2},
   {id:'p-shrimp',shop_id:s.id,category_id:c3.id,station_id:st.id,name:'กุ้งทอดกรอบ',price:35,cost:16,is_available:false,sort:1});
 D.stock_items.push({id:'s-noodle',shop_id:s.id,name:'เส้น',qty:1000,unit:'g',threshold:200,std_price:0.15});
 D.recipes.push({product_id:'p-tom',stock_id:'s-noodle',shop_id:s.id,qty:100});
 D.promotions.push({id:'pr1',shop_id:s.id,name:'ลด 10%',code:'SAVE10',kind:'percent',value:10,active:true});
 D.customers.push({id:'m1',shop_id:s.id,name:'คุณสมหญิง',phone:'081-234-5678',points:0,visits:0,spend:0});
 s.promptpay_id='0812345678';s.promptpay_name='ร้านแก้วหลงกรุง';
 window.__mockSave();return true})()"""

def decode_qr(png_path):
    img=cv2.imread(png_path)
    det=cv2.QRCodeDetector()
    data,pts,_=det.detectAndDecode(img)
    return data

async def main():
    srv=serve(); base=f'http://127.0.0.1:{srv.server_address[1]}/'
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1024,'height':768},device_scale_factor=2)
        await ctx.route('**/*',route)
        await ctx.add_init_script("window.print=()=>{window.__printed=(window.__printed||0)+1}")
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto(base+'index.html'); await pg.evaluate('window.__mockReset()'); await pg.reload(); await pg.wait_for_selector('#fLogin')
        await login(pg,'owner@shop.test'); await pg.wait_for_selector('#obCreate'); await pg.click('#obCreate'); await pg.fill('#csName','แก้วหลงกรุง'); await pg.click('#csGo')
        await pg.wait_for_selector('[data-go=setup]'); await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_selector('#posGrid .ptile')
        await pg.wait_for_timeout(300)

        # emoji -> line icon (category named "🍜 ก๋วยเตี๋ยว")
        chips=await pg.evaluate("[...document.querySelectorAll('#posChips button')].map(b=>b.textContent.trim())")
        check('category chip shows the name without the emoji',chips==['ทั้งหมด','ก๋วยเตี๋ยว','เครื่องดื่ม','เมนูพิเศษ'],chips)
        emo=await pg.evaluate("/[\\u{1F300}-\\u{1FAFF}]/u.test(document.body.innerText)")
        check('no emoji left in the visible page',not emo)
        await pg.evaluate("document.querySelector('.pagehead h1').textContent='ขาย 🍜 วันนี้'"); await pg.wait_for_timeout(150)
        conv=await pg.evaluate("[!!document.querySelector('.pagehead h1 svg.emo'),/\\u{1F35C}/u.test(document.querySelector('.pagehead h1').textContent)]")
        check('emoji added later is auto-converted to a line icon',conv==[True,False],conv)
        ph=await pg.evaluate("getComputedStyle(document.querySelector('[data-sell=\"p-tea\"] .ph')).color")
        check('photo-less tile uses the category colour + glyph',ph!='rgb(180, 96, 42)',ph)

        # tablet layout: grid + cart panel
        cp=await pg.evaluate("(()=>{const r=document.querySelector('#cartPanel').getBoundingClientRect();return [Math.round(r.width),getComputedStyle(document.querySelector('#cartBar')).display]})()")
        check('tablet: cart panel 340px beside grid, no cart bar',cp==[340,'none'],cp)
        # choose table 2
        await pg.click('#actCtx'); await pg.click('.tpick [data-t]:nth-child(2)'); await pg.wait_for_timeout(400)
        lbl=await pg.text_content('#ctxLabel'); check('selling to โต๊ะ 2',lbl=='โต๊ะ 2',lbl)
        await pg.click('[data-sell="p-tea"]'); await pg.click('[data-sell="p-tea"]')
        await pg.click('[data-sell="p-tom"]'); await pg.wait_for_selector('.optc')
        await pg.click('#oAdd'); await pg.wait_for_timeout(200)
        still=await pg.is_visible('.optc'); check('required option enforced (sheet stays open)',still)
        await pg.click('.optc[data-g="g-noodle"][data-i="0"]'); await pg.click('.optc[data-g="g-extra"][data-i="0"]'); await pg.click('#oPlus')
        btn=await pg.text_content('#oAdd'); check('options sheet price 2 × (50+10)',btn.strip().endswith('฿120'),btn)
        await shot(pg,'v21-01-options-1024'); await pg.click('#oAdd'); await pg.wait_for_timeout(300)
        tot=await pg.text_content('.cpfoot .sumrow b'); check('cart total 25×2 + 120',tot.strip()=='฿170',tot)
        await shot(pg,'v21-02-sell-1024'); await audit(pg,'sell 1024')
        await pg.click('[data-send]'); await pg.wait_for_function("!document.querySelector('.cline')",timeout=5000)
        o=await pg.evaluate("window.__mockLoad(),window.__DB.orders[0]")
        check('order created with server prices',o and o['total']==170 and o['status']=='open',o and o['total'])
        sk=await pg.evaluate("window.__DB.rpcLog.includes('staff_add_items')"); check('sent via staff_add_items',sk)

        # tables page
        await pg.click('.rail [data-nav=tables]'); await pg.wait_for_selector('.tcard')
        st=await pg.evaluate("[...document.querySelectorAll('.tcard')].map(c=>c.querySelector('.tname').textContent+':'+c.querySelector('.pill').textContent)")
        check('โต๊ะ 2 shows สั่งแล้ว',st[1]=='โต๊ะ 2:สั่งแล้ว',st[:3])
        await shot(pg,'v21-03-tables-1024'); await audit(pg,'tables 1024')

        # kitchen
        await pg.click('.rail [data-nav=kitchen]'); await pg.wait_for_selector('.ticket')
        n=await pg.evaluate("document.querySelectorAll('.ticket .kline').length"); check('kitchen ticket shows only kitchen items (tea has no station)',n==1,n)
        note=await pg.text_content('.ticket .kline .s'); check('ticket shows options',note and 'เส้นเล็ก' in note,note)
        await shot(pg,'v21-04-kitchen-1024')
        await pg.click('[data-kst=cooking]'); await pg.wait_for_selector('[data-kst=served]'); await pg.click('[data-kst=served]'); await pg.wait_for_timeout(500)
        ks=await pg.evaluate("window.__mockLoad(),window.__DB.order_items.filter(i=>i.product_id==='p-tom').map(i=>i.kitchen_status)")
        check('kitchen marked served',ks==['served'],ks)

        # customer QR order (phone-sized tab, same browser storage)
        tok=await pg.evaluate("window.__DB.dining_tables[2].qr_token")
        cu=await ctx.new_page(); cu.on('pageerror',lambda e:errs.append('customer: '+str(e)))
        await cu.set_viewport_size({'width':360,'height':740})
        await cu.goto(base+'order.html?t='+tok); await cu.wait_for_selector('.citem')
        await shot(cu,'v21-05-customer-menu-360'); await audit(cu,'customer menu 360')
        off=await cu.evaluate("!!document.querySelector('.citem.off .pill')"); check('customer sees sold-out item as หมด',off)
        await cu.click('[data-cadd="p-yen"]'); await cu.wait_for_selector('.optc'); await cu.click('.optc[data-g="g-noodle"][data-i="1"]')
        await cu.fill('#optNote','ไม่เผ็ด'); await shot(cu,'v21-06-customer-options-360'); await cu.click('#oAdd')
        await cu.click('[data-cadd="p-water"]'); await cu.wait_for_selector('#cCart'); await cu.click('#cCart'); await cu.wait_for_selector('#cSend'); await cu.wait_for_timeout(400)
        await shot(cu,'v21-07-customer-cart-360'); await cu.click('#cSend'); await cu.wait_for_selector('.steps2')
        await shot(cu,'v21-08-customer-status-360'); await audit(cu,'customer status 360')
        pend=await cu.text_content('#cStatus .pill'); check('customer sees รอร้านยืนยัน',pend=='รอร้านยืนยัน',pend)
        await cu.click('[data-svc=call]'); await cu.wait_for_timeout(300)

        # staff confirms
        await pg.click('.rail [data-nav=tables]'); await pg.wait_for_selector('.alerts')
        alerts=await pg.evaluate("[...document.querySelectorAll('.alerts .t')].map(e=>e.textContent)"); check('tables page shows QR order + staff call',any('QR' in a for a in alerts) and any('เรียกพนักงาน' in a for a in alerts),alerts)
        await pg.click('.alerts [data-table]'); await pg.wait_for_selector('[data-confirm]'); await pg.wait_for_timeout(400); await shot(pg,'v21-09-confirm-1024')
        await pg.click('[data-confirm]'); await pg.wait_for_timeout(700)
        q=await pg.evaluate("window.__mockLoad(),window.__DB.orders.find(o=>o.source==='qr').status"); check('QR order confirmed to open',q=='open',q)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await cu.evaluate("cPaintStatus()"); await cu.wait_for_timeout(400)
        cs=await cu.text_content('#cStatus .pill'); check('customer now sees ร้านรับออเดอร์แล้ว',cs=='ร้านรับออเดอร์แล้ว',cs)

        # bill for โต๊ะ 2: cash 500, promo SAVE10 + member
        await pg.click('.rail [data-nav=tables]'); await pg.wait_for_selector('.tcard'); await pg.click('.tcard:nth-child(2)'); await pg.wait_for_selector('[data-pay]')
        await pg.click('.sfoot [data-pay]'); await pg.wait_for_selector('#bConfirm')
        await pg.click('[data-disc=code]'); await pg.click('[data-promo=pr1]')
        t=await pg.text_content('#bTotal'); check('promo 10% → 153',t=='฿153',t)
        await pg.fill('#bPhone','5678'); await pg.click('#bFind'); await pg.wait_for_timeout(300)
        mem=await pg.text_content('#bMember'); check('member found by last digits',mem and 'คุณสมหญิง' in mem,mem)
        await pg.click('#bQuick button:has-text("500")'); await pg.wait_for_timeout(100)
        ch=await pg.text_content('#bChange .amt'); check('change shown 347',ch=='฿347',ch)
        await shot(pg,'v21-10-bill-cash-1024'); await audit(pg,'bill 1024')
        await pg.click('#bConfirm'); await pg.wait_for_selector('#pdPrint')
        await shot(pg,'v21-11-paid-1024')
        await pg.click('#pdPrint'); await pg.wait_for_timeout(200)
        pr=await pg.evaluate("[window.__printed,document.querySelector('#printArea .receipt')?.innerText.includes('SAVE10')||document.querySelector('#printArea .receipt')?.innerText.includes('ส่วนลด')]")
        check('receipt printed with discount line',pr[0]==1 and pr[1],pr)
        o2=await pg.evaluate("window.__mockLoad(),[window.__DB.orders[0].status,window.__DB.orders[0].total,window.__DB.stock_items[0].qty,window.__DB.customers[0].points]")
        check('paid; stock deducted 2×100g; member +1 point',o2==['paid',153,800,1],o2)

        # PromptPay bill for โต๊ะ 3 and decode the QR
        await pg.click('[data-close]'); await pg.wait_for_timeout(300)
        await pg.click('.rail [data-nav=tables]'); await pg.wait_for_selector('.tcard'); await pg.click('.tcard:nth-child(3)'); await pg.wait_for_selector('.sfoot [data-pay]')
        await pg.click('.sfoot [data-pay]'); await pg.wait_for_selector('#bConfirm'); await pg.click('[data-method=promptpay]'); await pg.wait_for_selector('.ppbox svg')
        tot=await pg.text_content('#bTotal')
        await pg.evaluate("document.querySelector('.ppbox .qrbox').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
        el=await pg.query_selector('.ppbox .qrbox'); await el.screenshot(path=os.path.join(SHOTS,'v21-qr.png'))
        data=decode_qr(os.path.join(SHOTS,'v21-qr.png'))
        exp=await pg.evaluate(f"promptPayPayload('0812345678',{float(tot.replace('฿','').replace(',',''))})")
        check('PromptPay QR decodes to the exact payload for the bill amount',data==exp and ('54%02d%s'%(len('%.2f'%float(tot.replace('฿','').replace(',',''))),'%.2f'%float(tot.replace('฿','').replace(',','')))) in data,(data,exp))
        await shot(pg,'v21-12-bill-promptpay-1024')
        await pg.click('#bConfirm'); await pg.wait_for_selector('#pdPrint'); await pg.click('[data-close]')

        # summary + drawer
        await pg.click('.rail [data-nav=summary]'); await pg.wait_for_selector('.kpi')
        kv=await pg.evaluate("[...document.querySelectorAll('.kpi .kv')].map(e=>e.textContent)")
        check('summary: total and bills',kv[0]=='฿233' and kv[1]=='2',kv)
        await shot(pg,'v21-13-summary-1024'); await audit(pg,'summary 1024')
        await pg.click('.rail [data-nav=profile]'); await pg.wait_for_selector('[data-mi]')
        await pg.click('[data-mi="1.0"]'); await pg.wait_for_selector('#drOpen'); await pg.click('#drOpen'); await pg.wait_for_selector('#drClose')
        await pg.fill('#drCount','2000'); await pg.click('#drClose'); await pg.wait_for_selector('.sheet [data-ok]')
        msg=await pg.text_content('.sheet .sbody'); check('drawer closes with expected vs counted',('ควรมี' in msg) and ('ตรงพอดี' in msg),msg)
        await pg.click('.sheet [data-ok]')

        # category icon picker
        await pg.click('.rail [data-nav=menu]'); await pg.wait_for_selector('[data-tab=cats]'); await pg.click('[data-tab=cats]'); await pg.wait_for_selector('[data-editcat]')
        await pg.click('[data-editcat="cat-other"]'); await pg.wait_for_selector('#ceIcons')
        auto=await pg.evaluate("document.querySelector('#ceIcons .on')?.dataset.icon"); check('icon auto-guess for unknown name = other',auto=='other',auto)
        await pg.click('#ceIcons [data-icon=fries]'); await shot(pg,'v21-14-icon-picker-1024'); await pg.click('#ceSave'); await pg.wait_for_timeout(400)
        ic=await pg.evaluate("window.__mockLoad(),window.__DB.categories.find(c=>c.id==='cat-other').icon"); check('picked icon saved',ic=='fries',ic)

        # phone: sell page cart bar + cart sheet; kitchen and tables audit
        ph=await ctx.new_page(); ph.on('pageerror',lambda e:errs.append('phone: '+str(e)))
        await ph.set_viewport_size({'width':360,'height':740})
        await ph.goto(base+'index.html'); await ph.wait_for_selector('#posGrid .ptile')
        await ph.click('[data-sell="p-water"]'); await ph.wait_for_timeout(200)
        bar=await ph.evaluate("(()=>{const b=document.querySelector('#cartBar');const n=document.querySelector('.bottomnav');return [getComputedStyle(b).display!=='none',Math.round(b.getBoundingClientRect().bottom)<=Math.round(n.getBoundingClientRect().top)]})()")
        check('phone: cart bar visible above the bottom nav',bar==[True,True],bar)
        await shot(ph,'v21-15-sell-360'); await audit(ph,'sell 360')
        await ph.click('#cartBar'); await ph.wait_for_selector('#cartSheetBody .cline'); await ph.wait_for_timeout(400); await shot(ph,'v21-16-cartsheet-360')
        await ph.keyboard.press('Escape')
        for nav,name in [('tables','tables'),('kitchen','kitchen'),('summary','summary')]:
            await ph.click(f'.bottomnav [data-nav={nav}]'); await ph.wait_for_timeout(700); await shot(ph,f'v21-17-{name}-360'); await audit(ph,f'{name} 360')
        check('no JavaScript errors',not errs,errs[:3])
        await b.close()
    srv.shutdown()
    bad=[r for r in results if not r[0]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
