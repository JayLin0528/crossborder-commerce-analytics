const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('guided demo runs through all steps and restores the previous view', () => {
  const elements = new Map();
  const handlers = new Map();
  const timers = new Map();
  let nextTimer = 1;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: false, style: {},
      classList: { add() {}, remove() {} }, scrollIntoView() {},
      addEventListener(type, fn) { handlers.set(`${id}:${type}`, fn); }
    });
    return elements.get(id);
  }
  const button = element('start-button');
  element('source-badge').textContent = '示例数据';
  const document = {
    getElementById: element,
    querySelector: element,
    querySelectorAll(selector) { return selector === '.start-demo' ? [button] : []; }
  };
  const context = { document, Intl, Date, Number, String, Map, Set, console,
    setTimeout(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
  const before = element('kpi-revenue').textContent;
  assert.notEqual(before, '—');
  handlers.get('start-button:click')();
  assert.equal(element('source-badge').textContent, '演示导入 CSV');
  while (timers.size) {
    const [id, fn] = timers.entries().next().value;
    timers.delete(id);
    fn();
  }
  assert.equal(element('demo-step').textContent, '自动演示 · 5/5');
  handlers.get('close-demo:click')();
  assert.equal(element('source-badge').textContent, '示例数据');
  assert.equal(element('kpi-revenue').textContent, before);
  assert.equal(element('demo-guide').hidden, true);
});
