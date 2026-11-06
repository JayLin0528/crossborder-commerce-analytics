const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const cut = source.indexOf('  let demoTimer=');
assert.ok(cut > 0, 'analytics functions are present');
const script = source.slice(0, cut) + '\n  globalThis.core={csvParse,normalizeCSV,net,profit,toCSV};\n})();';
const context = { Intl, Date, Number, String, Map, Set, console };
vm.createContext(context);
vm.runInContext(script, context);
const { csvParse, normalizeCSV, net, profit, toCSV } = context.core;

test('CSV parser supports quoted commas and escaped quotes', () => {
  const parsed = csvParse('a,b\r\n"one,two","a""b"\r\n');
  assert.equal(parsed[1][0], 'one,two');
  assert.equal(parsed[1][1], 'a"b');
});

test('multi-currency rows convert to USD, deduplicate, and calculate profit', () => {
  const csv = 'order_id,date,platform,country,sku,product,quantity,currency,revenue,product_cost,shipping_cost,ad_spend,platform_fee,refund_amount,fx_to_usd\n'
    + '1,2026-11-01,Amazon,英国,A,Test,1,GBP,100,40,10,5,10,5,1.25\n'
    + '1,2026-11-01,Amazon,英国,A,Test,1,GBP,100,40,10,5,10,5,1.25\n'
    + '2,2026-11-02,Shopify,美国,B,Test 2,1,USD,50,15,3,2,2,0,\n';
  const result = normalizeCSV(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.quality.duplicates, 1);
  assert.equal(net(result.rows[0]), 118.75);
  assert.equal(profit(result.rows[0]), 37.5);
  const exported = toCSV(result.rows);
  assert.match(exported, /,USD,125,50,12.5,6.25,12.5,6.25,1/);
  assert.equal(normalizeCSV(exported).rows[0].revenue, 125);
});

test('non-USD row without exchange rate is skipped', () => {
  const csv = 'order_id,date,platform,country,revenue,currency,fx_to_usd\n1,2026-11-01,Amazon,美国,100,USD,\n2,2026-11-01,eBay,英国,100,GBP,';
  const result = normalizeCSV(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.quality.skipped, 1);
  assert.equal(result.quality.missingCosts.length, 4);
});
