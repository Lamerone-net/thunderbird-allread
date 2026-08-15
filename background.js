const MAIL_ACCOUNT_TYPES = new Set(["imap", "pop3", "none"]);
const UPDATE_CONCURRENCY = 12;
const BADGE_RESET_DELAY = 5000;
const ALL_ACCOUNTS = "all";

let activeRun = null;
let badgeResetTimer = null;

function message(key, substitutions) {
  return messenger.i18n.getMessage(key, substitutions);
}

function setBadge(text, color, title) {
  if (badgeResetTimer) {
    clearTimeout(badgeResetTimer);
    badgeResetTimer = null;
  }

  messenger.action.setBadgeText({ text });
  messenger.action.setBadgeBackgroundColor({ color });
  messenger.action.setTitle({ title });
}

function resetBadgeLater() {
  badgeResetTimer = setTimeout(() => {
    messenger.action.setBadgeText({ text: "" });
    messenger.action.setTitle({ title: message("actionTitle") });
    badgeResetTimer = null;
  }, BADGE_RESET_DELAY);
}

async function collectUnreadMessageIds(accountId) {
  const ids = [];
  let page = await messenger.messages.query({ accountId, read: false });

  while (page) {
    for (const message of page.messages || []) {
      if (message.read === false) {
        ids.push(message.id);
      }
    }

    if (!page.id) {
      break;
    }
    page = await messenger.messages.continueList(page.id);
  }

  return ids;
}

async function markIdsAsRead(ids, onProgress) {
  let nextIndex = 0;
  let marked = 0;
  const errors = [];

  async function worker() {
    while (nextIndex < ids.length) {
      const index = nextIndex++;
      try {
        await messenger.messages.update(ids[index], { read: true });
        marked += 1;
        onProgress(marked);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  const workerCount = Math.min(UPDATE_CONCURRENCY, ids.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { marked, errors };
}

async function markEverythingAsRead() {
  setBadge("…", "#3973c4", message("searching"));

  const accounts = await messenger.accounts.list();
  const mailAccounts = accounts.filter(account => MAIL_ACCOUNT_TYPES.has(account.type));
  const { selectedAccountId = ALL_ACCOUNTS } = await messenger.storage.local.get("selectedAccountId");
  let selectedAccounts = selectedAccountId === ALL_ACCOUNTS
    ? mailAccounts
    : mailAccounts.filter(account => account.id === selectedAccountId);
  if (selectedAccounts.length === 0 && selectedAccountId !== ALL_ACCOUNTS) {
    selectedAccounts = mailAccounts;
    await messenger.storage.local.set({ selectedAccountId: ALL_ACCOUNTS });
  }
  const allIds = [];
  const errors = [];

  for (const account of selectedAccounts) {
    try {
      allIds.push(...await collectUnreadMessageIds(account.id));
    } catch (error) {
      errors.push(error);
      console.error(`Unable to read account ${account.name}:`, error);
    }
  }

  if (allIds.length === 0) {
    const title = errors.length
      ? message("noMessagesAccountError")
      : message("alreadyRead");
    setBadge(errors.length ? "!" : "✓", errors.length ? "#c43d3d" : "#2e8b57", title);
    resetBadgeLater();
    return;
  }

  setBadge("0", "#3973c4", message("progress", ["0", String(allIds.length)]));
  const result = await markIdsAsRead(allIds, marked => {
    const badgeText = marked > 999 ? "999+" : String(marked);
    setBadge(badgeText, "#3973c4", message("progress", [String(marked), String(allIds.length)]));
  });

  errors.push(...result.errors);
  if (errors.length) {
    setBadge("!", "#c43d3d", message("partialResult", [String(result.marked), String(errors.length)]));
  } else {
    setBadge("✓", "#2e8b57", message("success", String(result.marked)));
  }
  resetBadgeLater();
}

messenger.action.onClicked.addListener(() => {
  if (activeRun) {
    return activeRun;
  }

  activeRun = markEverythingAsRead()
    .catch(error => {
      console.error("Error while marking messages as read:", error);
      setBadge("!", "#c43d3d", message("genericError"));
      resetBadgeLater();
    })
    .finally(() => {
      activeRun = null;
    });

  return activeRun;
});
