const MAIL_ACCOUNT_TYPES = new Set(["imap", "pop3", "none"]);
const MESSAGES_PER_PAGE = 100;
const UPDATE_BATCH_SIZE = 10;
const UPDATE_PAUSE_MS = 25;
const PROGRESS_INTERVAL_MS = 250;
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

function pauseUpdates() {
  // Awaiting an API promise alone does not guarantee time for UI work.
  return new Promise(resolve => setTimeout(resolve, UPDATE_PAUSE_MS));
}

async function markAccountAsRead(accountId, result, onProgress) {
  let listId = await messenger.messages.query({
    accountId,
    read: false,
    messagesPerPage: MESSAGES_PER_PAGE,
    autoPaginationTimeout: 100,
    returnMessageListId: true
  });

  try {
    while (listId) {
      const page = await messenger.messages.continueList(listId);
      listId = page.id;
      let attempted = 0;
      for (const mail of page.messages) {
        if (mail.read !== false) {
          continue;
        }
        try {
          await messenger.messages.update(mail.id, { read: true });
          result.marked += 1;
        } catch (error) {
          result.errors += 1;
          // Retain only a count, not an unbounded array of Error objects.
          if (result.errors === 1) {
            console.error("Unable to mark a message as read:", error);
          }
        }
        onProgress();
        attempted += 1;
        if (attempted % UPDATE_BATCH_SIZE === 0) {
          await pauseUpdates();
        }
      }
      // Also yield for short or empty pages and before reading the next page.
      await pauseUpdates();
    }
  } finally {
    if (listId) {
      try {
        await messenger.messages.abortList(listId);
      } catch (error) {
        console.error("Unable to release the message list:", error);
      }
    }
  }
}

async function markEverythingAsRead() {
  setBadge("…", "#3973c4", message("searching"));

  const accounts = await messenger.accounts.list(false);
  const mailAccounts = accounts.filter(account => MAIL_ACCOUNT_TYPES.has(account.type));
  const { selectedAccountId = ALL_ACCOUNTS } = await messenger.storage.local.get("selectedAccountId");
  let selectedAccounts = selectedAccountId === ALL_ACCOUNTS
    ? mailAccounts
    : mailAccounts.filter(account => account.id === selectedAccountId);
  if (selectedAccounts.length === 0 && selectedAccountId !== ALL_ACCOUNTS) {
    selectedAccounts = mailAccounts;
    await messenger.storage.local.set({ selectedAccountId: ALL_ACCOUNTS });
  }
  const result = { marked: 0, errors: 0 };
  let lastProgress = Date.now();
  const onProgress = () => {
    const now = Date.now();
    if (now - lastProgress < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastProgress = now;
    const badgeText = result.marked > 999 ? "999+" : String(result.marked);
    // The total is unknown until all pages have been processed.
    setBadge(badgeText, "#3973c4", message("progress", [String(result.marked), "…"]));
  };

  for (const account of selectedAccounts) {
    try {
      await markAccountAsRead(account.id, result, onProgress);
    } catch (error) {
      result.errors += 1;
      console.error(`Unable to read account ${account.name}:`, error);
    }
  }

  if (result.errors) {
    const title = result.marked === 0
      ? message("noMessagesAccountError")
      : message("partialResult", [String(result.marked), String(result.errors)]);
    setBadge("!", "#c43d3d", title);
  } else {
    const title = result.marked === 0
      ? message("alreadyRead")
      : message("success", String(result.marked));
    setBadge("✓", "#2e8b57", title);
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
