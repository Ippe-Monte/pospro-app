-- Behaviour tests for 002_pospro_v2_1_selling.sql (runs after sql_rls_test.sql, reusing its users and shop)
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
-- owner adds recipe + promo + member
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
update categories set icon='noodle';
insert into stock_items(shop_id,name,qty,unit) select v::uuid,'เส้น',1000,'g' from _t where k='shop';
insert into recipes(product_id,stock_id,shop_id,qty) select p.id,s.id,p.shop_id,100 from products p, stock_items s where p.name='หมูต้มยำ';
insert into promotions(shop_id,name,code,kind,value) select v::uuid,'ลด 10%','SAVE10','percent',10 from _t where k='shop';
insert into customers(shop_id,name,phone) select v::uuid,'คุณสมหญิง','0812345678' from _t where k='shop';
reset role;

-- cashier: direct insert is now blocked
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ begin begin insert into order_items(order_id,shop_id,name,unit_price,qty) select id,shop_id,'x',1,1 from orders limit 1; assert false,'direct item insert must fail';
  exception when insufficient_privilege then null; end; end $$;
-- add items to โต๊ะ 6 with an option; price must come from db
do $$ declare r jsonb; pid text; gid text; begin
  select id into pid from products where name='หมูต้มยำ'; select id into gid from option_groups limit 1;
  r := staff_add_items((select v::uuid from _t where k='shop'),
        jsonb_build_array(jsonb_build_object('product_id',pid,'qty',3,'unit_price',1,'choices',jsonb_build_array(jsonb_build_object('group_id',gid,'name','เพิ่มหมู'))),
                          jsonb_build_object('product_id',(select id from products where name='กุ้งทอด'),'qty',1,'note','กรอบๆ')),
        (select id from dining_tables where name='โต๊ะ 6'));
  insert into _t values('o7', r->>'order_id');
  assert (r->>'total')::numeric = 3*60+35, 'staff price from db incl. option + sold-out allowed for staff: '||(r->>'total');
  -- second call to same table appends to the same bill
  r := staff_add_items((select v::uuid from _t where k='shop'), jsonb_build_array(jsonb_build_object('product_id',pid,'qty',1)), (select id from dining_tables where name='โต๊ะ 6'));
  assert r->>'order_id' = (select v from _t where k='o7'), 'same open bill for the table';
  assert (r->>'total')::numeric = 265, 'total 265';
end $$;
-- takeaway order
do $$ declare r jsonb; begin
  r := staff_add_items((select v::uuid from _t where k='shop'), jsonb_build_array(jsonb_build_object('product_id',(select id from products where name='หมูต้มยำ'),'qty',2)), null, null, 'Grab');
  assert (select channel from orders where id=(r->>'order_id')::uuid)='Grab' and (select table_id from orders where id=(r->>'order_id')::uuid) is null, 'takeaway';
  insert into _t values('ta', r->>'order_id');
end $$;
-- void one item
select void_item((select id from order_items where order_id=(select v::uuid from _t where k='o7') and name='กุ้งทอด'));
do $$ begin assert (select total from orders where id=(select v::uuid from _t where k='o7'))=230, 'void removes 35'; end $$;
-- confirm the pending QR order on โต๊ะ 3 (no open bill there -> becomes open)
do $$ declare r jsonb; begin
  r := confirm_qr_order((select v::uuid from _t where k='qo'));
  assert (select status from orders where id=(select v::uuid from _t where k='qo'))='open', 'qr confirmed to open';
  begin perform confirm_qr_order((select v::uuid from _t where k='qo')); assert false,'double confirm'; exception when raise_exception then null; end;
end $$;
reset role;
-- a second QR order on โต๊ะ 6 merges into its open bill
insert into _t select 't7', qr_token::text from dining_tables where name='โต๊ะ 6';
insert into _t select 'p_tom', id::text from products where name='หมูต้มยำ';
insert into _t select 'p_shrimp', id::text from products where name='กุ้งทอด';
select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$ declare r jsonb; begin
  r := place_qr_order((select v::uuid from _t where k='t7'), jsonb_build_array(jsonb_build_object('product_id',(select v from _t where k='p_tom'),'qty',1)));
  insert into _t values('q7', r->>'order_id');
  begin perform place_qr_order((select v::uuid from _t where k='t7'),
     jsonb_build_array(jsonb_build_object('product_id',(select v from _t where k='p_shrimp'),'qty',1))); assert false,'qr sold out';
  exception when raise_exception then null; end;
  begin perform staff_add_items((select v::uuid from _t where k='shop'), '[]'); assert false,'anon staff rpc';
  exception when insufficient_privilege or raise_exception then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ declare r jsonb; begin
  r := confirm_qr_order((select v::uuid from _t where k='q7'));
  assert r->>'order_id' = (select v from _t where k='o7'), 'merged into table bill';
  assert (select total from orders where id=(select v::uuid from _t where k='o7'))=280, 'bill 230+50';
  assert (select status from orders where id=(select v::uuid from _t where k='q7'))='void', 'qr order voided after merge';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$ declare g jsonb; begin
  g := get_qr_order((select v::uuid from _t where k='t7'), (select v::uuid from _t where k='q7'));
  assert g->>'status'='open' and (g->>'merged')::boolean and (g->>'total')::numeric=280, 'customer sees merged bill: '||g::text;
  assert get_qr_order(gen_random_uuid(), (select v::uuid from _t where k='q7')) is null, 'wrong token';
end $$;
reset role; select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
-- pay with promo code SAVE10 in cash, member points, stock deduction
do $$ declare r jsonb; begin
  begin perform pay_order((select v::uuid from _t where k='o7'),'cash',100); assert false,'not enough cash'; exception when raise_exception then null; end;
  r := pay_order((select v::uuid from _t where k='o7'),'cash',300,0,'save10',(select id from customers limit 1));
  assert (r->>'total')::numeric=252 and (r->>'change')::numeric=48, 'promo 10% of 280 = 28, change 48: '||r::text;
  assert (select stock_items.qty from stock_items limit 1)=1000-100*5, 'stock -500 (5 tom yum sold incl. merged qr)';
  assert (select points from customers limit 1)=2 and (select visits from customers limit 1)=1, 'member points';
  begin perform pay_order((select v::uuid from _t where k='o7'),'cash',300); assert false,'pay twice'; exception when raise_exception then null; end;
  r := pay_order((select v::uuid from _t where k='ta'),'promptpay',null,500);
  assert (r->>'total')::numeric=0 and (r->>'discount')::numeric=100, 'manual discount clamped to subtotal';
end $$;
-- drawer + summary
do $$ declare d jsonb; begin
  assert (drawer_summary((select v::uuid from _t where k='shop'))->>'open')::boolean = false;
  perform open_drawer((select v::uuid from _t where k='shop'), 1000);
  begin perform open_drawer((select v::uuid from _t where k='shop'), 1000); assert false,'double open'; exception when raise_exception then null; end;
  d := day_summary((select v::uuid from _t where k='shop'));
  assert (d->>'bills')::int = 2 and (d->>'total')::numeric = 252, 'summary '||d::text;
  assert (d->'by_method'->>'cash')::numeric = 252, 'by method';
  assert d->'top_items'->0->>'name' = 'หมูต้มยำ', 'top item';
end $$;
reset role;
-- a cash sale after opening the drawer is counted
update cash_sessions set opened_at = now() - interval '1 hour';
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ declare d jsonb; begin
  d := close_drawer((select v::uuid from _t where k='shop'), 1250, 'ทดสอบ');
  assert (d->>'expected')::numeric = 1252 and (d->>'diff')::numeric = -2, 'drawer '||d::text;
end $$;
-- kitchen cannot pay, cannot add
reset role; select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
do $$ begin
  begin perform staff_add_items((select v::uuid from _t where k='shop'), jsonb_build_array(jsonb_build_object('product_id',(select v from _t where k='p_tom'),'qty',1))); assert false,'kitchen add';
  exception when raise_exception then null; end;
  begin perform day_summary((select v::uuid from _t where k='shop')); assert false,'kitchen summary'; exception when raise_exception then null; end;
end $$;
-- another shop's product cannot be sold here
reset role; select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
insert into _t select 'shop2', create_shop('ร้านอื่น','C')::text;
insert into categories(shop_id,name) select v::uuid,'อื่น' from _t where k='shop2';
insert into products(shop_id,name,price) select v::uuid,'ของร้านอื่น',1 from _t where k='shop2';
insert into _t select 'p_other', id::text from products where name='ของร้านอื่น';
reset role; select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ begin
  begin perform staff_add_items((select v::uuid from _t where k='shop'), jsonb_build_array(jsonb_build_object('product_id',(select v from _t where k='p_other'),'qty',1)));
    assert false,'cross-shop product must be rejected'; exception when raise_exception then null; end;
end $$;
-- outsider cannot confirm / pay
reset role; select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
do $$ begin
  begin perform pay_order((select v::uuid from _t where k='qo'),'cash',1000); assert false,'outsider pay'; exception when raise_exception then null; end;
end $$;
reset role;
select 'ALL V2.1 SQL TESTS PASSED' as result;
