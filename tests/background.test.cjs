const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../background.js'), 'utf8');

function harness({ selected = 'all', pages = {}, failIds = [], failPage, failQuery } = {}) {
  const state = { queries: [], updates: [], aborts: [], titles: [], badges: [], pauses: [], saved: [], events: [], maxConcurrent: 0 };
  let click, now = 0, concurrent = 0;
  const positions = {};
  const messenger = {
    i18n: { getMessage: (key, args) => JSON.stringify([key, args]) },
    action: {
      onClicked: { addListener: fn => { click = fn; } },
      setBadgeText: value => state.badges.push(value.text),
      setBadgeBackgroundColor: () => {},
      setTitle: value => state.titles.push(JSON.parse(value.title))
    },
    accounts: { list: async include => {
      assert.equal(include, false);
      return ['imap', 'pop3', 'none', 'rss', 'nntp'].map((type, i) => ({ id: String(i), name: type, type }));
    } },
    storage: { local: { get: async () => ({ selectedAccountId: selected }), set: async value => state.saved.push(value) } },
    messages: {
      query: async query => {
        state.queries.push(query);
        if (query.accountId === failQuery) throw Error('query failure');
        positions[query.accountId] = 0;
        return query.accountId;
      },
      continueList: async id => {
        const index = positions[id]++;
        state.events.push(`page:${id}:${index}`);
        if (failPage === `${id}:${index}`) throw Error('page failure');
        const list = pages[id] || [[]];
        return { id: index + 1 < list.length ? id : null, messages: list[index] };
      },
      update: async (id, properties) => {
        assert.equal(properties.read, true);
        concurrent++;
        state.maxConcurrent = Math.max(state.maxConcurrent, concurrent);
        await Promise.resolve();
        concurrent--;
        state.updates.push(id);
        state.events.push(`update:${id}`);
        if (failIds.includes(id)) throw Error('update failure');
      },
      abortList: async id => state.aborts.push(id)
    }
  };
  vm.runInNewContext(source, {
    messenger, console: { error() {} }, Date: { now: () => now },
    setTimeout(fn, delay) {
      if (delay !== 5000) {
        state.pauses.push(delay);
        now += delay;
        queueMicrotask(fn);
      }
      return 1;
    },
    clearTimeout() {}
  });
  return { state, click: () => click() };
}
const mail = id => ({ id, read: false });

test('large mailbox: streams pages, limits concurrency, yields and throttles UI', async () => {
  const pages = Array.from({ length: 30 }, (_, page) => Array.from({ length: 100 }, (_, i) => mail(page * 100 + i)));
  const { state, click } = harness({ selected: '0', pages: { 0: pages } });
  const run = click();
  assert.equal(click(), run, 'repeated click must reuse the active run');
  await run;
  assert.equal(state.updates.length, 3000);
  assert.equal(new Set(state.updates).size, 3000);
  assert.equal(state.maxConcurrent, 1);
  assert.ok(state.events.indexOf('update:99') < state.events.indexOf('page:0:1'));
  assert.ok(state.pauses.length >= 300);
  assert.ok(state.badges.length < 40);
  assert.ok(state.badges.includes('999+'));
  assert.deepEqual(state.titles.at(-1), ['success', '3000']);
  assert.equal(state.queries.length, 1);
  assert.equal(state.queries[0].returnMessageListId, true);
  assert.equal(state.queries[0].messagesPerPage, 100);
  assert.deepEqual(state.aborts, []);
});

test('continues after empty pages and message failures; skips already-read entries', async () => {
  const { state, click } = harness({ selected: '1', pages: { 1: [[], [mail(1), { id: 2, read: true }, mail(3)]] }, failIds: [1] });
  await click();
  assert.deepEqual(state.updates, [1, 3]);
  assert.deepEqual(state.titles.at(-1), ['partialResult', ['1', '1']]);
});

test('releases failed pagination and continues with remaining supported accounts', async () => {
  const { state, click } = harness({ pages: { 0: [[mail(1)], [mail(2)]], 1: [[mail(3)]] }, failPage: '0:1' });
  await click();
  assert.deepEqual(state.aborts, ['0']);
  assert.deepEqual(state.queries.map(q => q.accountId), ['0', '1', '2']);
  assert.deepEqual(state.updates, [1, 3]);
  assert.deepEqual(state.titles.at(-1), ['partialResult', ['2', '1']]);
});

test('empty mailbox and subsequent click complete normally', async () => {
  const { state, click } = harness();
  await click();
  await click();
  assert.equal(state.queries.length, 6);
  assert.deepEqual(state.titles.at(-1), ['alreadyRead', null]);
});

test('query failure is reported, not presented as already read', async () => {
  const { state, click } = harness({ selected: '0', failQuery: '0' });
  await click();
  assert.deepEqual(state.titles.at(-1), ['noMessagesAccountError', null]);
  assert.equal(state.badges.at(-1), '!');
});

test('missing selected account restores the existing all-accounts fallback', async () => {
  const { state, click } = harness({ selected: 'removed' });
  await click();
  assert.equal(state.saved[0].selectedAccountId, 'all');
  assert.deepEqual(state.queries.map(q => q.accountId), ['0', '1', '2']);
});
