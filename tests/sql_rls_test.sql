-- Behaviour tests for 001_pospro_v2_schema.sql (run against the stub). Every check raises on failure.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
insert into auth.users values (:A,'owner@x'),(:B,'cashier@x'),(:C,'outsider@x'),(:D,'kitchen@x');
create table public._t(k text primary key, v text); grant all on public._t to anon, authenticated;

-- 1 owner creates a shop
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into _t select 'shop', create_shop('แก้วหลงกรุง','เจ้าของ')::text;
do $$ begin assert (select count(*) from dining_tables)=6, 'six tables'; assert (select count(*) from stations)=1, 'one station'; end $$;
insert into _t select 'code', join_code from shops;
insert into categories(shop_id,name) select v::uuid,'ก๋วยเตี๋ยว' from _t where k='shop';
insert into option_groups(shop_id,category_id,name,required,choices)
  select s.v::uuid, c.id, 'เพิ่มเติม', false, '[{"name":"เพิ่มหมู","price":10},{"name":"ไม่ใส่ผัก","price":0}]' from _t s, categories c where s.k='shop';
insert into products(shop_id,category_id,station_id,name,price) select s.v::uuid,c.id,st.id,'หมูต้มยำ',50 from _t s, categories c, stations st where s.k='shop';
insert into products(shop_id,category_id,name,price,is_available) select s.v::uuid,c.id,'กุ้งทอด',35,false from _t s, categories c where s.k='shop';
reset role;

-- 2 cashier joins: pending sees nothing, cannot self-promote
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select join_shop((select v from _t where k='code'),'สมหญิง');
do $$ begin assert (select count(*) from products)=0, 'pending member must not read products'; end $$;
do $$ begin
  begin perform set_member((select v::uuid from _t where k='shop'), auth.uid(), 'manager','active'); assert false, 'pending self-promote must fail';
  exception when raise_exception then null; end; end $$;
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select set_member((select v::uuid from _t where k='shop'), :B, 'cashier','active');
select join_shop((select v from _t where k='code'),'x') ; -- owner calling join again is harmless
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ begin assert (select count(*) from products)=2, 'active cashier reads products'; end $$;
do $$ begin
  begin insert into products(shop_id,name,price) select v::uuid,'แอบเพิ่ม',1 from _t where k='shop'; assert false,'cashier must not add products';
  exception when insufficient_privilege then null; end; end $$;
do $$ begin assert (select count(*) from expenses)=0; end $$;
-- 4 orders: number from db, totals from items, cannot fake total
insert into orders(shop_id, table_id) select s.v::uuid, (select id from dining_tables where name='โต๊ะ 5') from _t s where s.k='shop';
do $$ begin assert (select order_no from orders)=1001, 'first order 1001'; end $$;
insert into order_items(order_id,shop_id,product_id,name,unit_price,qty) select o.id,o.shop_id,p.id,p.name,60,2 from orders o, products p where p.name='หมูต้มยำ';
do $$ begin assert (select total from orders)=120, 'total from items'; end $$;
update orders set total=1, subtotal=1;
do $$ begin assert (select total from orders)=120, 'fake total ignored'; end $$;
update orders set discount=500;
do $$ begin assert (select discount from orders)=120 and (select total from orders)=0, 'discount clamped'; end $$;
update orders set discount=20;
do $$ begin assert (select total from orders)=100, 'discount 20'; end $$;
reset role;

-- 5 kitchen: status via RPC only
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
select join_shop((select v from _t where k='code'),'จอครัว');
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select set_member((select v::uuid from _t where k='shop'), :D, 'kitchen','active', (select id from stations limit 1));
do $$ begin begin perform set_member((select v::uuid from _t where k='shop'), auth.uid(), 'manager','active'); assert false,'last owner demote must fail';
  exception when raise_exception then null; end; end $$;
reset role;
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
select set_item_status((select id from order_items limit 1),'cooking');
update order_items set unit_price=1;
do $$ begin assert (select unit_price from order_items limit 1)=60, 'kitchen cannot change price';
             assert (select kitchen_status from order_items limit 1)='cooking'; end $$;
reset role;

-- 3 outsider sees nothing
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
do $$ begin assert (select count(*) from shops)=0 and (select count(*) from orders)=0 and (select count(*) from shop_members)=0, 'outsider sees nothing'; end $$;
update shops set name='hacked';
reset role;
do $$ begin assert (select name from shops)='แก้วหลงกรุง', 'outsider cannot rename'; end $$;

-- 6 customer by QR (anon)
insert into _t select 'tok', qr_token::text from dining_tables where name='โต๊ะ 3';
select set_config('request.jwt.claim.sub', '', false); set role anon;
do $$ declare m jsonb; begin
  m := get_table_menu((select v::uuid from _t where k='tok'));
  assert m->'table'->>'name'='โต๊ะ 3'; assert jsonb_array_length(m->'products')=2;
end $$;
do $$ begin assert (select count(*) from products)=0, 'anon cannot read tables directly'; end $$;
do $$ declare r jsonb; pid text; gid text; begin
  select e->>'id' into pid from _t, jsonb_array_elements(get_table_menu(v::uuid)->'products') e where k='tok' and (e->>'is_available')::boolean;
  select (get_table_menu(v::uuid)->'option_groups'->0->>'id') into gid from _t where k='tok';
  r := place_qr_order((select v::uuid from _t where k='tok'),
        jsonb_build_array(jsonb_build_object('product_id',pid,'qty',2,'price',1,'choices',jsonb_build_array(jsonb_build_object('group_id',gid,'name','เพิ่มหมู'))) ));
  insert into _t values('qo', r->>'order_id');
  assert (get_qr_order((select v::uuid from _t where k='tok'), (r->>'order_id')::uuid)->>'total')::numeric = 120, 'qr price from db: (50+10)*2';
  assert get_qr_order(gen_random_uuid(), (r->>'order_id')::uuid) is null, 'wrong token sees nothing';
end $$;
do $$ declare pid text; begin
  select v into pid from _t where k='tok';
  begin perform place_qr_order(pid::uuid, '[{"product_id":"00000000-0000-0000-0000-000000000000","qty":1}]'); assert false,'unknown product';
  exception when raise_exception then null; end;
  begin perform place_qr_order(pid::uuid, jsonb_build_array(jsonb_build_object('product_id',(select id from products where false),'qty',99))); assert false,'bad qty';
  exception when raise_exception then null; end;
  begin perform get_table_menu(gen_random_uuid()); assert false,'bad token'; exception when raise_exception then null; end;
  begin perform place_qr_order(pid::uuid, jsonb_build_array(jsonb_build_object('product_id',
      (select e->>'id' from jsonb_array_elements(get_table_menu(pid::uuid)->'products') e where not (e->>'is_available')::boolean),'qty',1)));
    assert false,'sold-out product must be rejected'; exception when raise_exception then null; end;
end $$;
select request_service((select v::uuid from _t where k='tok'),'bill');
select request_service((select v::uuid from _t where k='tok'),'bill');
do $$ begin begin insert into orders(shop_id) select v::uuid from _t where k='shop'; assert false,'anon insert';
  exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin assert (select count(*) from service_requests)=1, 'duplicate bill request ignored';
             assert (select status from orders where source='qr')='pending'; end $$;

-- 7 storage paths
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into storage.objects(bucket_id,name) select 'pospro', v||'/products/p1-1.jpg' from _t where k='shop';
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
do $$ begin begin insert into storage.objects(bucket_id,name) select 'pospro', v||'/products/x.jpg' from _t where k='shop'; assert false,'cashier upload';
  exception when insufficient_privilege then null; end; end $$;
reset role;
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
do $$ begin begin insert into storage.objects(bucket_id,name) select 'pospro', v||'/products/x.jpg' from _t where k='shop'; assert false,'outsider upload';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values ('pospro','not-a-uuid/x.jpg'); assert false,'bad path';
  exception when insufficient_privilege then null; end; end $$;
reset role;
select 'ALL SQL TESTS PASSED' as result;
