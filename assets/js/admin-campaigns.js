// Admin-only campaign management. All eligibility, permission and send limits are server-side.
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
export async function renderCampaigns(host, { draftsOnly = true } = {}) {
  const root = el("section");
  root.className = "admin-hub admin-campaigns";
  host.replaceChildren(root);
  root.innerHTML = `<h2>Email campaigns</h2><p class="admin-hub-lede">Preview an audience, send yourself a test, then send a five-recipient pilot before continuing. No email is sent by previewing or creating a draft.</p><p class="campaign-status" role="status"></p><section class="admin-hub-section"><h3>Create a campaign</h3><div class="campaign-form"><label>Audience<select id="campaign-audience"><option value="unclaimed">Unclaimed profiles</option><option value="inactive">Inactive members · no activity in 30 days</option><option value="active">Active members · seen in the last 30 days</option><option value="all">All eligible accounts</option></select></label><label>Subject<input id="campaign-subject" maxlength="160" value="Your CharlestonHacks community is waiting"></label><label>Message<textarea id="campaign-message" rows="5" maxlength="5000">Discover projects, meet people, and find a way to contribute to the CharlestonHacks community.</textarea></label><label>App destination for claimed members<select id="campaign-destination"><option value="home">Home</option><option value="projects">Explore projects</option><option value="opportunities">Explore opportunities</option></select></label></div><p class="admin-hub-note">Unclaimed recipients receive an individual verified claim link instead. Unsubscribe links are included. Admins, disabled and recognized test profiles, suppressed addresses and ambiguous claim addresses are excluded. Shared addresses are deduplicated. You can exclude additional people below.</p><button type="button" id="campaign-preview">Preview audience</button><div id="campaign-preview-result"></div><button type="button" id="campaign-create" disabled>Create draft from preview</button></section><section class="admin-hub-section"><h3>Recent campaign history · latest 50</h3><button type="button" id="campaign-history-refresh">Refresh history</button><ul id="campaign-history"></ul></section><section class="admin-hub-section" id="campaign-report-section" hidden><h3>Delivery report</h3><p class="campaign-summary"></p><details><summary>Saved message and destination</summary><pre class="campaign-saved-message"></pre></details><p class="admin-hub-note">Accepted means Resend accepted the request; it does not confirm inbox delivery. Delivered, bounced and complained statuses come from signed provider events. Unknown results are not automatically retried.</p><div class="campaign-send-controls"><button type="button" id="campaign-test">Send test to my verified email</button><button type="button" id="campaign-pilot">Send pilot · up to 5 recipients</button><label><input type="checkbox" id="campaign-reviewed"> I reviewed the pilot and approve continuing</label><button type="button" id="campaign-batch">Send remaining queue · batches of 5</button><button type="button" id="campaign-pause" disabled>Pause after current batch</button><button type="button" id="campaign-report-refresh">Refresh report</button><button type="button" id="campaign-cancel">Cancel remaining recipients</button></div><p class="admin-hub-note">A draft's message and audience snapshot are fixed. Changed eligibility is rechecked at send time. Limits: 50 requests/hour, 90/day, and one campaign per recipient per seven days. Cancellation stops unsent recipients; already reserved messages may complete. To change a draft, create another one.</p><div id="campaign-delivery-rows"></div></section>`;
  if (draftsOnly) {
    const notice = el("p", "Draft mode: campaign sending is paused until a mailing address and delivery setup are ready. You can preview audiences and save drafts for later.");
    notice.className = "campaign-draft-notice admin-hub-note";
    root.querySelector("h2").after(notice);
    root.querySelector(".admin-hub-lede").textContent = "Prepare audiences and messages now. Saved drafts remain available for when campaign delivery is enabled.";
  }
  const q = (selector) => root.querySelector(selector);
  let preview = null,
    previewOffset = 0,
    reportOffset = 0,
    id = null,
    report = null,
    busy = false,
    running = false,
    pauseRequested = false;
  const excluded = new Set();
  const rpc = async (action, campaignId = null, payload = {}) => {
    const { data, error } = await window.supabase.rpc("admin_email_campaign", {
      p_action: action,
      p_id: campaignId,
      p_payload: payload,
    });
    if (error) throw error;
    return data;
  };
  function buttons() {
    root
      .querySelectorAll("button,input,select,textarea")
      .forEach((n) => (n.disabled = busy));
    q("#campaign-create").disabled = busy || !preview || preview.eligible < 1;
    q("#campaign-test").disabled =
      draftsOnly || busy || !report?.can_send || report?.test_attempted;
    q("#campaign-pilot").disabled =
      draftsOnly || busy ||
      !report?.can_send ||
      !report?.test_accepted ||
      report?.pilot_started ||
      !(report?.counts?.ready > 0);
    q("#campaign-batch").disabled =
      draftsOnly || busy ||
      !report?.can_send ||
      !report?.pilot_started ||
      !q("#campaign-reviewed").checked ||
      !(report?.counts?.ready > 0);
    q("#campaign-cancel").disabled =
      busy || !report?.can_send || !(report?.counts?.ready > 0);
    q("#campaign-pause").disabled = !running;
    q("#campaign-reviewed").disabled = busy || draftsOnly;
  }
  async function task(fn) {
    if (busy) return;
    busy = true;
    buttons();
    q(".campaign-status").textContent = "Working…";
    try {
      await fn();
      if (root.isConnected && q(".campaign-status").textContent === "Working…")
        q(".campaign-status").textContent = "Updated.";
    } catch (error) {
      if (root.isConnected)
        q(".campaign-status").textContent = ["PGRST202", "42883"].includes(
          error.code,
        )
          ? "Campaigns need the documented database and Edge Function setup."
          : String(
              error.message ||
                "Campaign request failed. Refresh to review the latest state.",
            );
    } finally {
      busy = false;
      if (root.isConnected) buttons();
    }
  }
  function pager(target, offset, total, onPage) {
    const nav = el("div");
    nav.className = "campaign-pagination";
    for (const [label, value, disabled] of [
      ["Previous", Math.max(0, offset - 50), offset === 0],
      ["Next", offset + 50, offset + 50 >= total],
    ]) {
      const b = el("button", label);
      b.type = "button";
      b.disabled = disabled;
      b.dataset.pageDisabled = String(disabled);
      b.onclick = () => task(() => onPage(value));
      nav.append(b);
    }
    nav.append(
      el(
        "span",
        total
          ? `${offset + 1}–${Math.min(offset + 50, total)} of ${total}`
          : "No recipients",
      ),
    );
    target.append(nav);
  }
  // Preserve pagination's own disabled state when the overall busy state clears.
  const baseButtons = buttons;
  buttons = function () {
    baseButtons();
    root
      .querySelectorAll("[data-page-disabled=true],[data-rule-excluded=true]")
      .forEach((n) => (n.disabled = true));
  };
  async function loadPreview(offset = 0) {
    previewOffset = offset;
    preview = await rpc("preview", null, {
      audience: q("#campaign-audience").value,
      excluded_ids: [...excluded],
      offset,
    });
    if (!root.isConnected) return;
    const target = q("#campaign-preview-result");
    target.replaceChildren(
      el(
        "p",
        `${preview.eligible} eligible recipients. ${Object.entries(
          preview.excluded,
        )
          .map(([reason, n]) => `${n} ${reason.replaceAll("_", " ")}`)
          .join(" · ")}`,
      ),
    );
    const list = el("ul");
    list.className = "campaign-recipients";
    for (const row of preview.recipients) {
      const li = el("li"),
        label = el("label"),
        box = el("input");
      box.type = "checkbox";
      const fixed = !["eligible", "manually_excluded"].includes(row.reason);
      box.checked = fixed || excluded.has(row.person_id);
      box.dataset.ruleExcluded = String(fixed);
      box.disabled = busy || fixed;
      box.setAttribute("aria-label", `Exclude ${row.name || row.email}`);
      box.onchange = () => {
        if (box.checked) excluded.add(row.person_id);
        else excluded.delete(row.person_id);
        task(() => loadPreview(previewOffset));
      };
      label.append(
        box,
        document.createTextNode(
          ` Exclude · ${row.name || "Unnamed"} · ${row.email || "No email"} · ${row.reason.replaceAll("_", " ")}${row.needs_claim ? " · claim link" : ""}`,
        ),
      );
      li.append(label);
      list.append(li);
    }
    target.append(list);
    pager(target, offset, preview.total, loadPreview);
  }
  async function history() {
    const rows = await rpc("list");
    if (!root.isConnected) return;
    const target = q("#campaign-history");
    target.replaceChildren();
    for (const row of rows) {
      const li = el("li"),
        button = el(
          "button",
          `${row.subject} · ${row.audience}${row.cancelled ? " · cancelled" : ""}`,
        );
      button.type = "button";
      button.onclick = () =>
        task(async () => {
          id = row.id;
          reportOffset = 0;
          q("#campaign-reviewed").checked = false;
          await loadReport();
        });
      li.append(button);
      target.append(li);
    }
    if (!rows.length) target.append(el("li", "No campaigns yet."));
  }
  async function loadReport(offset = reportOffset) {
    reportOffset = offset;
    report = await rpc("report", id, { offset });
    if (!root.isConnected) return;
    q("#campaign-report-section").hidden = false;
    q(".campaign-summary").textContent =
      `${report.campaign.subject} · ${report.total} recipients · ${Object.entries(
        report.counts,
      )
        .map(([state, n]) => `${n} ${state}`)
        .join(" · ")}${report.campaign.cancelled ? " · Cancelled" : ""}`;
    q(".campaign-saved-message").textContent =
      report.campaign.message +
      "\n\nClaimed-member destination: " +
      report.campaign.destination;
    const target = q("#campaign-delivery-rows");
    target.replaceChildren();
    const list = el("ul");
    list.className = "campaign-recipients";
    for (const row of report.recipients)
      list.append(
        el(
          "li",
          `${row.is_test ? "TEST · " : ""}${row.name || "Unnamed"} · ${row.email} · ${row.status}${row.code ? " · " + row.code.replaceAll("_", " ") : ""}`,
        ),
      );
    target.append(list);
    pager(target, offset, report.report_total, loadReport);
  }
  async function send(mode) {
    if (draftsOnly) throw Error("Campaign sending is paused. Drafts remain available.");
    const { data, error } = await window.supabase.functions.invoke(
      "campaign-email",
      {
        body: {
          campaign_id: id,
          mode,
          reviewed: q("#campaign-reviewed").checked,
        },
      },
    );
    if (error) {
      let message =
        "Campaign request failed. Refresh the report before trying again.";
      try {
        const payload = await error.context?.json();
        if (payload?.error) message = payload.error;
      } catch {
        /* Response body may be unavailable. */
      }
      await loadReport();
      throw Error(message);
    }
    await loadReport();
    const results = data?.results || [];
    q(".campaign-status").textContent =
      `Request complete: ${results.filter((r) => r.status === "accepted").length} accepted, ${results.filter((r) => r.status === "failed").length} failed, ${results.filter((r) => r.status === "unknown").length} unknown. ${results.some((r) => !r.recorded) ? "Some audit updates are unconfirmed; inspect Resend. " : ""}Review the report before continuing.`;
    return results;
  }
  q("#campaign-preview").onclick = () => task(() => loadPreview(0));
  q("#campaign-audience").onchange = () => {
    excluded.clear();
    preview = null;
    q("#campaign-preview-result").replaceChildren();
    buttons();
  };
  q("#campaign-create").onclick = () =>
    task(async () => {
      const draft = await rpc("create", null, {
        audience: q("#campaign-audience").value,
        subject: q("#campaign-subject").value,
        message: q("#campaign-message").value,
        destination: q("#campaign-destination").value,
        excluded_ids: [...excluded],
      });
      id = draft.id;
      reportOffset = 0;
      q("#campaign-reviewed").checked = false;
      await history();
      await loadReport();
      q("#campaign-report-section").scrollIntoView({ block: "start" });
    });
  q("#campaign-history-refresh").onclick = () => task(history);
  q("#campaign-report-refresh").onclick = () => task(() => loadReport());
  q("#campaign-reviewed").onchange = buttons;
  for (const mode of ["test", "pilot"])
    q("#campaign-" + mode).onclick = () => task(() => send(mode));
  q("#campaign-pause").onclick = () => {
    pauseRequested = true;
    q(".campaign-status").textContent =
      "Pausing after the current batch completes…";
    q("#campaign-pause").disabled = true;
  };
  q("#campaign-batch").onclick = () =>
    task(async () => {
      running = true;
      pauseRequested = false;
      buttons();
      try {
        while (
          root.isConnected &&
          !pauseRequested &&
          report?.counts?.ready > 0
        ) {
          const before = report.counts.ready;
          const results = await send("batch");
          if (
            results.some((r) => r.status !== "accepted" || !r.recorded) ||
            report.counts.ready >= before
          )
            break;
        }
        if (pauseRequested)
          q(".campaign-status").textContent =
            "Queue paused. Review the report, then resume remaining recipients when ready.";
      } finally {
        running = false;
      }
    });
  q("#campaign-cancel").onclick = () =>
    task(async () => {
      await rpc("cancel", id);
      await loadReport();
      await history();
    });
  await task(history);
}
