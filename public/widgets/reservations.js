(() => {
  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const slotLabel = (value) => new Date(`2000-01-01T${String(value).slice(0, 5)}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

  function monthCells(month) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const cells = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function mount(root) {
    if (root.dataset.mounted === "1") return;
    root.dataset.mounted = "1";
    const locationId = root.dataset.locationId;
    const apiBase = (root.dataset.apiBase || "https://www.theouthaven.com").replace(/\/$/, "");
    if (!locationId) return;

    const today = iso(new Date());
    const state = {
      date: today,
      month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      partySize: 2,
      baseSlots: [],
      slots: [],
      selectedSlot: "",
      duration: 90,
      loading: false,
      seatingLoading: false,
      diningInventory: false,
      barInventory: false,
      seatingPreference: "",
      submitting: false,
      message: "",
      error: "",
      waitlist: false,
    };

    root.innerHTML = `<style>
      .toh-reserve{font-family:var(--body,Inter,system-ui,sans-serif);color:var(--text,#181818)}
      .toh-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.toh-card{background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:var(--radius,18px);padding:18px}.toh-head,.toh-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.toh-month{font-weight:900}.toh-nav,.toh-day,.toh-slot,.toh-submit,.toh-seat{font:inherit;cursor:pointer}.toh-nav{width:38px;height:38px;border-radius:999px;border:1px solid var(--border,#ddd);background:transparent;color:inherit}.toh-week,.toh-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.toh-week{margin-top:14px}.toh-week span{text-align:center;font-size:10px;font-weight:900;opacity:.45}.toh-days{margin-top:5px}.toh-day{aspect-ratio:1;border:0;border-radius:12px;background:transparent;color:inherit;font-weight:850}.toh-day:hover:not(:disabled){background:var(--surface2,#eee)}.toh-day[aria-pressed="true"]{background:var(--accent,#111);color:var(--accentText,#fff)}.toh-day:disabled{opacity:.2;cursor:not-allowed}.toh-meta{font-size:12px;opacity:.55;font-weight:700}.toh-select,.toh-input{border:1px solid var(--border,#ddd);background:var(--bg,#fff);color:inherit;border-radius:12px;padding:11px 12px;font:inherit;width:100%}.toh-times{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.toh-slot{border:1px solid var(--border,#ddd);background:transparent;color:inherit;border-radius:12px;padding:11px;font-weight:850}.toh-slot[aria-pressed="true"]{background:var(--accent,#111);color:var(--accentText,#fff);border-color:var(--accent,#111)}.toh-form{margin-top:14px;display:grid;gap:10px}.toh-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.toh-seating{margin-top:14px;border:1px solid var(--border,#ddd);border-radius:14px;padding:13px;background:var(--surface2,#f7f7f7)}.toh-seating-title{font-size:13px;font-weight:900}.toh-seating-help{font-size:11px;opacity:.6;margin-top:3px}.toh-seat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.toh-seat{border:1px solid var(--border,#ddd);background:var(--surface,#fff);color:inherit;border-radius:12px;padding:10px;font-weight:850;font-size:12px}.toh-seat[aria-pressed="true"]{background:var(--accent,#111);color:var(--accentText,#fff);border-color:var(--accent,#111)}.toh-seat:disabled{opacity:.35;cursor:not-allowed}.toh-submit{min-height:48px;border:0;border-radius:999px;background:var(--accent,#111);color:var(--accentText,#fff);font-weight:900;padding:0 18px}.toh-submit:disabled{opacity:.45;cursor:not-allowed}.toh-status{margin-top:10px;padding:11px 12px;border-radius:12px;font-size:13px;font-weight:800}.toh-error{background:#7f1d1d18;color:#b91c1c}.toh-success{background:#16653418;color:#15803d}.toh-empty{margin-top:14px;padding:16px;border-radius:12px;background:var(--surface2,#eee);font-size:13px;font-weight:800;opacity:.72}.toh-sms{border:1px solid var(--border,#ddd);border-radius:14px;padding:13px;background:var(--surface2,#f7f7f7)}.toh-sms label{display:flex;align-items:flex-start;gap:10px;cursor:pointer}.toh-sms input{margin-top:3px;flex:none}.toh-sms-copy{font-size:11px;font-weight:700;line-height:1.65;opacity:.72}.toh-sms-note{margin:7px 0 0 24px;font-size:10px;line-height:1.55;opacity:.55}.toh-sms a{color:inherit;font-weight:900;text-decoration:underline;text-underline-offset:2px}
      @media(max-width:760px){.toh-grid,.toh-form-grid{grid-template-columns:1fr}.toh-times{grid-template-columns:repeat(2,1fr)}.toh-seat-grid{grid-template-columns:1fr}}
    </style><div class="toh-reserve"><div class="toh-grid"><section class="toh-card" data-calendar></section><section class="toh-card" data-times></section></div><form class="toh-card toh-form" data-form><div class="toh-form-grid"><input class="toh-input" name="name" required placeholder="Full name"><input class="toh-input" name="email" type="email" required placeholder="Email"></div><div class="toh-form-grid"><input class="toh-input" name="phone" type="tel" inputmode="tel" autocomplete="tel" data-phone placeholder="Mobile number (optional)"><input class="toh-input" name="notes" placeholder="Special request (optional)"></div><div class="toh-sms"><label><input type="checkbox" name="smsConsent" value="yes" data-sms-consent disabled><span class="toh-sms-copy">I agree to receive SMS messages from TheOutHaven about my reservation, reservation reminders, account notifications, and customer care. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.</span></label><p class="toh-sms-note">Optional and unchecked by default. See our <a href="${apiBase}/sms-terms" target="_blank" rel="noopener noreferrer">SMS Terms</a> and <a href="${apiBase}/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p></div><div data-status></div><button class="toh-submit" type="submit" data-submit>Choose seating and time</button></form></div>`;

    const calendarEl = root.querySelector("[data-calendar]");
    const timesEl = root.querySelector("[data-times]");
    const form = root.querySelector("[data-form]");
    const phoneInput = root.querySelector("[data-phone]");
    const smsConsentInput = root.querySelector("[data-sms-consent]");
    const statusEl = root.querySelector("[data-status]");
    const submit = root.querySelector("[data-submit]");

    phoneInput.addEventListener("input", () => {
      const hasPhone = Boolean(String(phoneInput.value || "").trim());
      smsConsentInput.disabled = !hasPhone;
      if (!hasPhone) smsConsentInput.checked = false;
    });

    function renderCalendar() {
      const cells = monthCells(state.month);
      calendarEl.innerHTML = `<div class="toh-head"><button class="toh-nav" type="button" data-prev aria-label="Previous month">←</button><div class="toh-month">${state.month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div><button class="toh-nav" type="button" data-next aria-label="Next month">→</button></div><div class="toh-week">${DAY_LABELS.map((label) => `<span>${label}</span>`).join("")}</div><div class="toh-days">${cells.map((day, index) => {
        if (!day) return `<span data-blank="${index}"></span>`;
        const value = iso(day);
        return `<button class="toh-day" type="button" data-date="${value}" ${value < today ? "disabled" : ""} aria-pressed="${value === state.date}">${day.getDate()}</button>`;
      }).join("")}</div>`;
      calendarEl.querySelector("[data-prev]").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); };
      calendarEl.querySelector("[data-next]").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); };
      calendarEl.querySelectorAll("[data-date]").forEach((button) => button.addEventListener("click", () => {
        state.date = button.dataset.date;
        state.selectedSlot = "";
        state.seatingPreference = "";
        state.waitlist = false;
        renderCalendar();
        loadAvailability();
      }));
    }

    function renderTimes() {
      const both = state.diningInventory && state.barInventory;
      const seatingMarkup = both
        ? `<div class="toh-seating"><div class="toh-seating-title">Seating preference</div><div class="toh-seating-help">Choose your seating area first. Available times will match that choice. Exact placement is assigned by the venue.</div><div class="toh-seat-grid">${[["any","No preference"],["dining","Table seating"],["bar","Bar seating"]].map(([value,label]) => `<button type="button" class="toh-seat" data-seat="${value}" aria-pressed="${state.seatingPreference === value}">${label}</button>`).join("")}</div></div>`
        : state.barInventory
          ? `<div class="toh-seating"><div class="toh-seating-title">Seating</div><div class="toh-seating-help">Bar seating is available for this party size. Times are filtered automatically.</div></div>`
          : state.diningInventory
            ? `<div class="toh-seating"><div class="toh-seating-title">Seating</div><div class="toh-seating-help">Table seating is available for this party size. Times are filtered automatically.</div></div>`
            : `<div class="toh-seating"><div class="toh-seating-title">Seating</div><div class="toh-seating-help">No reservable seating is currently configured for this party size.</div></div>`;

      const timeMarkup = state.loading || state.seatingLoading
        ? `<div class="toh-empty">Checking live availability…</div>`
        : both && !state.seatingPreference
          ? `<div class="toh-empty">Choose a seating preference to see matching times.</div>`
          : state.slots.length
            ? `<div class="toh-times">${state.slots.map((slot) => `<button class="toh-slot" type="button" data-slot="${escapeHtml(slot)}" aria-pressed="${slot === state.selectedSlot}">${slotLabel(slot)}</button>`).join("")}</div>`
            : `<div class="toh-empty">No times are available for this seating choice on this date.</div>`;

      timesEl.innerHTML = `<div class="toh-row"><div><strong>Reserve</strong><div class="toh-meta">${parseDate(state.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div></div><select class="toh-select" style="width:auto" data-party aria-label="Party size">${Array.from({ length: 12 }, (_, i) => i + 1).map((size) => `<option value="${size}" ${size === state.partySize ? "selected" : ""}>${size} ${size === 1 ? "guest" : "guests"}</option>`).join("")}</select></div>${seatingMarkup}<div style="margin-top:14px"><strong>Available times</strong></div>${timeMarkup}`;

      timesEl.querySelector("[data-party]").onchange = (event) => {
        state.partySize = Number(event.target.value);
        state.selectedSlot = "";
        state.seatingPreference = "";
        loadAvailability();
      };
      timesEl.querySelectorAll("[data-seat]").forEach((button) => button.addEventListener("click", () => {
        state.seatingPreference = button.dataset.seat || "any";
        state.selectedSlot = "";
        filterTimes(state.seatingPreference);
      }));
      timesEl.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
        state.selectedSlot = button.dataset.slot;
        state.waitlist = false;
        renderTimes();
        renderSubmit();
      }));
      renderSubmit();
    }

    function renderSubmit() {
      statusEl.innerHTML = state.error ? `<div class="toh-status toh-error">${escapeHtml(state.error)}</div>` : state.message ? `<div class="toh-status toh-success">${escapeHtml(state.message)}</div>` : "";
      const both = state.diningInventory && state.barInventory;
      const noBaseAvailability = !state.loading && state.baseSlots.length === 0;
      state.waitlist = noBaseAvailability;
      submit.disabled = state.submitting || state.loading || state.seatingLoading || (!state.waitlist && ((both && !state.seatingPreference) || !state.selectedSlot));
      submit.textContent = state.submitting ? "Working…" : state.waitlist ? "Join waitlist" : state.selectedSlot ? `Reserve ${slotLabel(state.selectedSlot)}` : both && !state.seatingPreference ? "Choose seating" : "Choose a time";
    }

    async function request(action, options = {}) {
      const url = `${apiBase}/api/widgets/reservations?action=${encodeURIComponent(action)}&locationId=${encodeURIComponent(locationId)}${options.query || ""}`;
      const response = await fetch(url, options.fetch || {});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || data.reason || "Reservation request failed."), { data });
      return data;
    }

    async function filterTimes(preference) {
      if (!state.baseSlots.length) {
        state.slots = [];
        renderTimes();
        return;
      }
      state.seatingLoading = true;
      state.error = "";
      renderTimes();
      try {
        const data = await request("seating", { query: `&date=${encodeURIComponent(state.date)}&partySize=${state.partySize}&preference=${encodeURIComponent(preference || "any")}&times=${encodeURIComponent(state.baseSlots.join(","))}` });
        state.diningInventory = Boolean(data.dining_inventory);
        state.barInventory = Boolean(data.bar_inventory);
        if (!preference && state.diningInventory && state.barInventory) {
          state.seatingPreference = "";
          state.slots = [];
        } else {
          if (!state.diningInventory && state.barInventory) state.seatingPreference = "bar";
          else if (state.diningInventory && !state.barInventory) state.seatingPreference = "dining";
          state.slots = Array.isArray(data.available_times) ? data.available_times : [];
        }
      } catch (error) {
        state.slots = [];
        state.error = error.message || "Unable to verify seating availability.";
      } finally {
        state.seatingLoading = false;
        renderTimes();
        renderSubmit();
      }
    }

    async function loadAvailability() {
      state.loading = true;
      state.error = "";
      state.message = "";
      state.waitlist = false;
      state.baseSlots = [];
      state.slots = [];
      state.diningInventory = false;
      state.barInventory = false;
      state.selectedSlot = "";
      state.seatingPreference = "";
      renderTimes();
      try {
        const data = await request("availability", { query: `&date=${encodeURIComponent(state.date)}&partySize=${state.partySize}` });
        state.baseSlots = Array.isArray(data.slots) ? data.slots : [];
        state.duration = Number(data.durationMinutes || 90);
      } catch (error) {
        state.error = error.message || "Unable to load availability.";
      } finally {
        state.loading = false;
        if (state.baseSlots.length) await filterTimes("");
        else {
          renderTimes();
          renderSubmit();
        }
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const seatingPreference = state.seatingPreference || (state.barInventory && !state.diningInventory ? "bar" : state.diningInventory && !state.barInventory ? "dining" : "any");
      const phone = String(data.get("phone") || "").trim();
      const smsConsent = Boolean(data.get("smsConsent")) && Boolean(phone);
      const basePayload = {
        customer_name: String(data.get("name") || ""),
        customer_email: String(data.get("email") || ""),
        customer_phone: smsConsent ? phone : null,
        special_request: String(data.get("notes") || ""),
        reservation_date: state.date,
        reservation_time: state.selectedSlot || state.baseSlots[0] || "19:00",
        party_size: state.partySize,
        duration_minutes: state.duration,
        seating_preference: seatingPreference,
      };
      state.submitting = true;
      state.error = "";
      state.message = "";
      renderSubmit();
      try {
        if (state.waitlist || !state.baseSlots.length) {
          const result = await request("waitlist", { fetch: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservation_date: state.date, reservation_time: basePayload.reservation_time, party_size: state.partySize, contact_name: basePayload.customer_name, contact_email: basePayload.customer_email, contact_phone: basePayload.customer_phone }) } });
          state.message = `You're on the waitlist${result.waitlist_position ? `. Position: ${result.waitlist_position}.` : "."}`;
        } else {
          const lock = await request("lock", { fetch: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(basePayload) } });
          const booking = await request("book", { fetch: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...basePayload, slot_lock_id: lock.lock_id }) } });
          state.message = booking.auto_confirmed ? "Reservation confirmed. Check your email or SMS for details." : "Reservation request received and pending confirmation.";
        }
      } catch (error) {
        state.error = error.message || "Unable to complete reservation.";
      } finally {
        state.submitting = false;
        renderSubmit();
      }
    });

    renderCalendar();
    renderTimes();
    loadAvailability();
  }

  function boot() {
    document.querySelectorAll("[data-theouthaven-reservations]").forEach(mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();