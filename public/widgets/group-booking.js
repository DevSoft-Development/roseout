(() => {
  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = (value) => { const [year, month, day] = String(value).split("-").map(Number); return new Date(year, month - 1, day); };
  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

  function monthCells(month) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const cells = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to complete this request.");
    return data;
  }

  function paymentCopy(config, partySize) {
    if (!config) return "";
    if (config.paymentMode === "deposit") {
      const amount = money(config.depositAmountCents);
      return config.depositType === "per_person"
        ? `${amount} deposit per guest required. Estimated total deposit: ${money(Number(config.depositAmountCents || 0) * partySize)}.`
        : `${amount} booking deposit required.`;
    }
    if (config.paymentMode === "card_guarantee") return "A card guarantee is required to secure this group booking.";
    return config.confirmationMode === "instant"
      ? "Books instantly from live availability."
      : "Live inventory is held while the location reviews your group booking.";
  }

  async function mount(root) {
    if (root.dataset.nativeGroupMounted === "1") return;
    root.dataset.nativeGroupMounted = "1";
    const locationId = root.dataset.locationId;
    const apiBase = (root.dataset.apiBase || "https://www.theouthaven.com").replace(/\/$/, "");
    if (!locationId) return;

    const today = iso(new Date());
    let initial;
    try {
      initial = await fetchJson(`${apiBase}/api/public/large-group-availability?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(today)}&partySize=8`, { cache: "no-store" });
    } catch {
      return;
    }
    if (!initial.enabled) return;

    const initialConfig = initial.config || {};
    const minParty = Number(initialConfig.minPartySize || 8);
    const maxParty = Number(initialConfig.maxPartySize || 40);
    const state = {
      open: false,
      date: today,
      month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      partySize: minParty,
      config: initialConfig,
      slots: [],
      time: "",
      loading: false,
      submitting: false,
      message: "",
      error: "",
    };

    const reserve = root.querySelector(".toh-reserve");
    if (!reserve) return;
    const shell = document.createElement("section");
    shell.className = "toh-card toh-group-native";
    shell.style.marginTop = "14px";
    reserve.appendChild(shell);

    function renderShell() {
      const range = maxParty > minParty ? `${minParty}–${maxParty}` : `${minParty}+`;
      shell.innerHTML = `<style>
        .toh-group-native .toh-group-toggle{min-height:46px;border:0;border-radius:999px;background:var(--accent,#111);color:var(--accentText,#fff);font:inherit;font-weight:900;padding:0 18px;cursor:pointer}
        .toh-group-native .toh-group-panel{margin-top:16px;border-top:1px solid var(--border,#ddd);padding-top:16px}
        .toh-group-native .toh-group-copy{margin:7px 0 0;font-size:12px;line-height:1.6;opacity:.62}
        .toh-group-native .toh-group-note{margin-top:12px;padding:11px 12px;border-radius:12px;background:var(--surface2,#f7f7f7);font-size:12px;font-weight:800;line-height:1.55}
        .toh-group-native textarea.toh-input{min-height:92px;resize:vertical}
      </style><div class="toh-row"><div><strong>Group Booking</strong><div class="toh-meta">For parties of ${range} guests</div></div><button type="button" class="toh-group-toggle" data-group-toggle aria-expanded="${state.open}">${state.open ? "Close Group Booking" : "Open Group Booking"}</button></div><p class="toh-group-copy">Check live large-party availability from the same Reserve inventory used by the venue.</p><div data-group-panel></div>`;
      shell.querySelector("[data-group-toggle]").onclick = () => {
        state.open = !state.open;
        renderShell();
        if (state.open) loadAvailability();
      };
      if (state.open) renderPanel();
    }

    function renderCalendar(calendarEl) {
      const cells = monthCells(state.month);
      calendarEl.innerHTML = `<div class="toh-head"><button class="toh-nav" type="button" data-prev aria-label="Previous month">←</button><div class="toh-month">${state.month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div><button class="toh-nav" type="button" data-next aria-label="Next month">→</button></div><div class="toh-week">${DAY_LABELS.map((label) => `<span>${label}</span>`).join("")}</div><div class="toh-days">${cells.map((day, index) => {
        if (!day) return `<span data-blank="${index}"></span>`;
        const value = iso(day);
        return `<button class="toh-day" type="button" data-date="${value}" ${value < today ? "disabled" : ""} aria-pressed="${value === state.date}">${day.getDate()}</button>`;
      }).join("")}</div>`;
      calendarEl.querySelector("[data-prev]").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderPanel(); };
      calendarEl.querySelector("[data-next]").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderPanel(); };
      calendarEl.querySelectorAll("[data-date]").forEach((button) => button.addEventListener("click", () => {
        state.date = button.dataset.date;
        state.time = "";
        loadAvailability();
      }));
    }

    function renderPanel() {
      const panel = shell.querySelector("[data-group-panel]");
      if (!panel) return;
      panel.innerHTML = `<div class="toh-group-panel"><div class="toh-grid"><section class="toh-card" data-group-calendar></section><section class="toh-card" data-group-times></section></div><form class="toh-card toh-form" data-group-form><div class="toh-form-grid"><input class="toh-input" name="name" required placeholder="Full name"><input class="toh-input" name="email" type="email" required placeholder="Email"></div><div class="toh-form-grid"><input class="toh-input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number"><input class="toh-input" name="occasion" placeholder="Birthday, corporate dinner…"></div>${state.config.prixFixeMode !== "none" ? `<select class="toh-select" name="prixFixeInterest" ${state.config.prixFixeMode === "required" ? "disabled" : ""}><option value="unsure">Prix-fixe: Not sure yet</option><option value="yes" ${state.config.prixFixeMode === "required" ? "selected" : ""}>Prix-fixe / group menu</option><option value="no">No prix-fixe menu</option></select>${state.config.prixFixeMode === "required" ? '<input type="hidden" name="prixFixeInterest" value="yes">' : ""}` : '<input type="hidden" name="prixFixeInterest" value="no">'}<textarea class="toh-input" name="notes" placeholder="Group booking notes or special requests"></textarea><div class="toh-group-note">${escapeHtml(paymentCopy(state.config, state.partySize))}</div><div data-group-status></div><button class="toh-submit" type="submit" data-group-submit>${state.config.paymentMode === "deposit" ? "Continue to deposit" : "Book large group"}</button></form></div>`;

      renderCalendar(panel.querySelector("[data-group-calendar]"));
      renderTimes(panel.querySelector("[data-group-times]"));
      const form = panel.querySelector("[data-group-form]");
      form.addEventListener("submit", submitBooking);
      renderStatus();
    }

    function renderTimes(timesEl) {
      const options = [];
      for (let size = minParty; size <= maxParty; size += 1) options.push(`<option value="${size}" ${size === state.partySize ? "selected" : ""}>${size} guests</option>`);
      const slots = state.loading
        ? `<div class="toh-empty">Checking live availability…</div>`
        : state.slots.length
          ? `<div class="toh-times">${state.slots.map((slot) => `<button class="toh-slot" type="button" data-group-slot="${escapeHtml(slot.value)}" aria-pressed="${slot.value === state.time}">${escapeHtml(slot.label)}</button>`).join("")}</div>`
          : `<div class="toh-empty">No large-party times are available on this date.</div>`;
      timesEl.innerHTML = `<div class="toh-row"><div><strong>Large party</strong><div class="toh-meta">${parseDate(state.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div></div><select class="toh-select" style="width:auto" data-group-party>${options.join("")}</select></div><div style="margin-top:14px"><strong>Available times</strong></div>${slots}`;
      timesEl.querySelector("[data-group-party]").onchange = (event) => {
        state.partySize = Number(event.target.value);
        state.time = "";
        loadAvailability();
      };
      timesEl.querySelectorAll("[data-group-slot]").forEach((button) => button.addEventListener("click", () => {
        state.time = button.dataset.groupSlot || "";
        renderPanel();
      }));
    }

    function renderStatus() {
      const status = shell.querySelector("[data-group-status]");
      const submit = shell.querySelector("[data-group-submit]");
      if (status) status.innerHTML = state.error ? `<div class="toh-status toh-error">${escapeHtml(state.error)}</div>` : state.message ? `<div class="toh-status toh-success">${escapeHtml(state.message)}</div>` : "";
      if (submit) {
        submit.disabled = state.loading || state.submitting || !state.time;
        submit.textContent = state.submitting ? "Working…" : state.config.paymentMode === "deposit" ? "Continue to deposit" : state.time ? `Book group at ${escapeHtml(state.slots.find((slot) => slot.value === state.time)?.label || state.time)}` : "Choose a time";
      }
    }

    async function loadAvailability() {
      state.loading = true;
      state.error = "";
      state.message = "";
      if (state.open) renderPanel();
      try {
        const data = await fetchJson(`${apiBase}/api/public/large-group-availability?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(state.date)}&partySize=${state.partySize}`, { cache: "no-store" });
        state.config = data.config || state.config;
        state.slots = Array.isArray(data.slots) ? data.slots : [];
        state.time = state.slots.some((slot) => slot.value === state.time) ? state.time : "";
        if (data.reason) state.error = data.reason;
      } catch (error) {
        state.slots = [];
        state.time = "";
        state.error = error.message || "Unable to load large-party availability.";
      } finally {
        state.loading = false;
        if (state.open) renderPanel();
      }
    }

    async function submitBooking(event) {
      event.preventDefault();
      if (!state.time) return;
      const form = new FormData(event.currentTarget);
      state.submitting = true;
      state.error = "";
      state.message = "";
      renderStatus();
      try {
        const result = await fetchJson(`${apiBase}/api/public/large-group-bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId,
            customerName: form.get("name"),
            customerEmail: form.get("email"),
            customerPhone: form.get("phone"),
            reservationDate: state.date,
            reservationTime: state.time,
            partySize: state.partySize,
            occasion: form.get("occasion"),
            prixFixeInterest: form.get("prixFixeInterest"),
            notes: form.get("notes"),
          }),
        });
        if (result.checkoutUrl) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        state.message = result.message || "Your group booking was created.";
      } catch (error) {
        state.error = error.message || "Unable to complete this group booking.";
      } finally {
        state.submitting = false;
        renderStatus();
      }
    }

    renderShell();
  }

  function boot() {
    document.querySelectorAll("[data-theouthaven-reservations]").forEach((root) => mount(root));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else window.setTimeout(boot, 0);
})();
