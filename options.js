const MAIL_ACCOUNT_TYPES = new Set(["imap", "pop3", "none"]);
const ALL_ACCOUNTS = "all";

function localizePage() {
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = messenger.i18n.getMessage(element.dataset.i18n);
  });
}

async function loadAccounts() {
  localizePage();

  const select = document.querySelector("#account");
  const status = document.querySelector("#status");
  const accounts = (await messenger.accounts.list())
    .filter(account => MAIL_ACCOUNT_TYPES.has(account.type));
  const { selectedAccountId = ALL_ACCOUNTS } = await messenger.storage.local.get("selectedAccountId");

  select.add(new Option(messenger.i18n.getMessage("allAccounts"), ALL_ACCOUNTS));
  for (const account of accounts) {
    select.add(new Option(account.name, account.id));
  }

  const selectionExists = selectedAccountId === ALL_ACCOUNTS
    || accounts.some(account => account.id === selectedAccountId);
  select.value = selectionExists ? selectedAccountId : ALL_ACCOUNTS;

  if (!selectionExists) {
    await messenger.storage.local.set({ selectedAccountId: ALL_ACCOUNTS });
  }

  select.addEventListener("change", async () => {
    await messenger.storage.local.set({ selectedAccountId: select.value });
    status.textContent = messenger.i18n.getMessage("settingsSaved");
    window.setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
}

loadAccounts().catch(error => {
  console.error("Unable to load account settings:", error);
  document.querySelector("#status").textContent = messenger.i18n.getMessage("settingsError");
});
