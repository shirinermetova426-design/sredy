/* =====================================================================
   Молодёжка · Среды — приложение
   Данные: Supabase (если заполнен config.js) или демо-режим на устройстве.
   ===================================================================== */
(function () {
"use strict";

const CFG = window.SREDY_CONFIG || {};
const DEMO = !CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase;

const FORMATS = ["Разбор Писания + общение за столами", "Тематическая (слово / интервью / гость)", "Молитва и прославление", "Общение (настолки, активности)", "Особая встреча", "Новый формат (идея ребят)"];
const FMT_SHORT = { "Разбор Писания + общение за столами": "Разбор Писания", "Тематическая (слово / интервью / гость)": "Тематическая", "Общение (настолки, активности)": "Общение", "Новый формат (идея ребят)": "Новый формат" };
const STATUSES = ["Идея", "В работе", "Готово", "Проведено", "Перенос / отмена"];
const DEPTS = ["Программа сред", "Координация сред", "Welcome", "Домашние группы", "Организация и чай-пай", "Слайды", "Финансы", "Медиа", "Прославление", "Крупные проекты"];
const ROLES = { admin: "Админ", leader: "Лидер", member: "Участник" };
const IDEA_ST = ["Идея", "Пробуем", "Есть", "Отложили"];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const pd = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const days = (a, b) => Math.round((a - b) / 864e5);
const fmtD = (s, o) => pd(s).toLocaleDateString("ru-RU", o);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const short = s => fmtD(s, { day: "2-digit", month: "2-digit" });
const monthKey = s => String(s).slice(0, 7);
const monthName = k => { const d = pd(k + "-01"); return cap(d.toLocaleDateString("ru-RU", { month: "long" })) + " " + d.getFullYear(); };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const initials = n => ((n || "?").match(/\p{L}+/gu) || ["?"]).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const colorOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return "c" + (h % 4); };
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

function ruError(e) {
  const m = String(e?.message || e || "");
  if (/Invalid login credentials/i.test(m)) return "Неверная почта или пароль.";
  if (/already registered|already been registered/i.test(m)) return "Эта почта уже зарегистрирована. Войди во вкладке «Вход».";
  if (/Password should be at least/i.test(m)) return "Пароль должен быть не короче 6 символов.";
  if (/Email not confirmed/i.test(m)) return "Почта не подтверждена. Админу: выключи Confirm email в Supabase (см. инструкцию).";
  if (/rate limit|too many/i.test(m)) return "Слишком много попыток. Подожди минуту и попробуй снова.";
  if (/invalid.*email|Unable to validate email/i.test(m)) return "Проверь адрес почты.";
  if (/Token has expired|invalid.*otp|otp.*invalid/i.test(m)) return "Код неверный или устарел. Запроси новый.";
  if (/row-level security|permission denied/i.test(m)) return "Нет прав на это действие.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Нет связи с сервером. Проверь интернет.";
  if (/duplicate key.*date/i.test(m)) return "На эту дату встреча уже есть.";
  if (/Database error saving new user/i.test(m)) return "Не получилось создать аккаунт. Напиши админу.";
  if (/allowed_emails_email_check/i.test(m)) return "Проверь адреса почты в списке.";
  return m || "Что-то пошло не так.";
}

/* =====================================================================
   STORE: Supabase
   ===================================================================== */
function supabaseStore() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const chk = ({ data, error }) => { if (error) throw error; return data; };
  const tbl = n => ({
    list: async () => chk(await sb.from(n).select("*")),
    insert: async o => chk(await sb.from(n).insert(o).select().single()),
    update: async (id, p) => {
      const d = chk(await sb.from(n).update(p).eq("id", id).select().maybeSingle());
      if (!d) throw new Error("permission denied"); // правила доступа молча не дали изменить строку
      return d;
    },
    remove: async id => chk(await sb.from(n).delete().eq("id", id))
  });
  let channel = null;
  return {
    demo: false,
    async userId() { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; },
    async signIn(email, password) { chk(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(name, email, password) {
      const d = chk(await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } }));
      return { needsConfirm: !d.session };
    },
    async signOut() { await sb.auth.signOut(); },
    async resetSend(email) { chk(await sb.auth.resetPasswordForEmail(email)); },
    async resetConfirm(email, token, password) {
      chk(await sb.auth.verifyOtp({ email, token, type: "recovery" }));
      chk(await sb.auth.updateUser({ password }));
    },
    profiles: tbl("profiles"), meetings: tbl("meetings"), tasks: tbl("tasks"), ideas: tbl("ideas"),
    allowed: {
      list: async () => chk(await sb.from("allowed_emails").select("*").order("added_at")),
      add: async rows => chk(await sb.from("allowed_emails").upsert(rows, { onConflict: "email" })),
      remove: async email => chk(await sb.from("allowed_emails").delete().eq("email", email))
    },
    subscribe(onChange) {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel("sredy-all")
        .on("postgres_changes", { event: "*", schema: "public" }, p => onChange(p.table))
        .subscribe();
    },
    onAuth(cb) { sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") cb(); }); }
  };
}

/* =====================================================================
   STORE: демо (данные только на этом устройстве)
   ===================================================================== */
function demoStore() {
  const KEY = "sredy-demo-v3", SKEY = "sredy-demo-session";
  const P = { me: "demo-me", anya: "demo-anya", maria: "demo-maria", vit: "demo-vitalik", yulia: "demo-yulia", max: "demo-max", newb: "demo-new" };
  const m = (date, extra = {}) => Object.assign({ id: uid(), date, prep: "", start: "", format: "", theme: "", passage: "", goal: "", coord_id: null, speaker: "", servants: "", w_sent: false, w_agreed: false, welcome: "", groups: "", org: "", slides: "", media: "", budget: "", status: "Идея", notes: "", schedule: [] }, extra);
  const seed = () => {
    const meetings = [
      m("2026-11-28", { prep: "17:30", start: "18:30", format: "Особая встреча", status: "В работе", notes: "Суббота вместо среды 25.11", coord_id: P.me, schedule: [
        { t: "17:30", what: "Приходим готовить зал", who: [], note: "" },
        { t: "", what: "Дежурные", who: [P.vit, P.max], note: "" },
        { t: "18:30", what: "Начало, открывает", who: [P.anya], note: "" },
        { t: "18:35", what: "2 песни", who: [], note: "Прославление" },
        { t: "19:45", what: "Молитва и слово", who: [], note: "Тимур" },
        { t: "20:30", what: "Общение / чай-пай", who: [P.maria], note: "" },
        { t: "21:00", what: "Конец", who: [], note: "" }
      ] }),
      m("2026-12-02", { coord_id: P.anya }), m("2026-12-09"), m("2026-12-16", { coord_id: P.max }),
      m("2026-12-23", { notes: "Перед Рождеством: подумать о рождественской теме" }),
      m("2026-12-30", { notes: "Канун Нового года: уточнить, будет ли встреча" }),
      m("2027-01-06", { notes: "Канун православного Рождества: уточнить, будет ли встреча" }),
      m("2027-01-13"), m("2027-01-20"), m("2027-01-27")
    ];
    const t = (title, dept, assignees, due, by, extra = {}) => Object.assign({ id: uid(), title, dept, assignees, due, meeting_id: null, done: false, note: "", created_by: by, created_at: new Date().toISOString() }, extra);
    return {
      profiles: [
        { id: P.me, name: "Я (программа)", role: "admin", approved: true, depts: ["Программа сред", "Координация сред"] },
        { id: P.anya, name: "Аня", role: "member", approved: true, depts: ["Координация сред"] },
        { id: P.max, name: "Максим Яковлев", role: "member", approved: true, depts: ["Координация сред"] },
        { id: P.maria, name: "Мария", role: "leader", approved: true, depts: ["Welcome"] },
        { id: P.vit, name: "Виталик", role: "leader", approved: true, depts: ["Организация и чай-пай"] },
        { id: P.yulia, name: "Юля", role: "leader", approved: true, depts: ["Финансы"] },
        { id: P.newb, name: "Руслан", role: "member", approved: false, depts: [] }
      ],
      meetings,
      tasks: [
        t("Заполнить план сред на декабрь и январь", "Программа сред", [P.me], "2026-11-23", P.me),
        t("Распределить координаторов по датам", "Координация сред", [P.me], "", P.me),
        t("Подготовить зал и чай к субботе 28.11", "Организация и чай-пай", [P.vit], "2026-11-28", P.me, { meeting_id: meetings[0].id }),
        t("Встретить новых ребят 28.11", "Welcome", [P.maria], "2026-11-28", P.me, { meeting_id: meetings[0].id }),
        t("Передать темы декабря прославлению и согласовать с Катариной", "Прославление", [P.me], "", P.me),
        t("Найти ответственного за слайды на будущее", "Слайды", [P.me], "", P.me),
        t("Подвести итог пробного периода по финансам", "Финансы", [P.yulia], "2026-12-31", P.me),
        t("Подростковая среда 2.12: план игр", "Координация сред", [P.anya], "2026-11-25", P.me, { meeting_id: meetings[1].id }),
        t("Собрать у ребят идеи новых форматов", "Программа сред", [P.me, P.anya], "", P.me)
      ],
      ideas: [
        { id: uid(), title: "Разбор Писания + общение за столами", descr: "Короткий вход, отрывок, вопросы для обсуждения по столам", by_name: "Планёрка 16.11", status: "Есть", author: null },
        { id: uid(), title: "Тематическая", descr: "Слово, интервью или гость на тему", by_name: "Планёрка 16.11", status: "Есть", author: null },
        { id: uid(), title: "Молитва и прославление", descr: "Вечер, где основное время — молитва и прославление", by_name: "Планёрка 16.11", status: "Есть", author: null },
        { id: uid(), title: "Общение", descr: "Настолки, активности, игры", by_name: "Планёрка 16.11", status: "Есть", author: null }
      ]
    };
  };
  let db = lsGet(KEY, null) || seed();
  const persist = () => lsSet(KEY, db);
  let session = lsGet(SKEY, null);
  let onChange = () => {};
  const tbl = n => ({
    list: async () => JSON.parse(JSON.stringify(db[n])),
    insert: async o => { const row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, o); db[n].push(row); persist(); setTimeout(() => onChange(n)); return row; },
    update: async (id, p) => { const r = db[n].find(x => x.id === id); if (r) Object.assign(r, p); persist(); setTimeout(() => onChange(n)); return r; },
    remove: async id => { db[n] = db[n].filter(x => x.id !== id); persist(); setTimeout(() => onChange(n)); }
  });
  return {
    demo: true,
    async userId() { return session && db.profiles.some(p => p.id === session) ? session : null; },
    async signInAs(id) { session = id; lsSet(SKEY, id); },
    async signIn() { throw new Error("В демо-режиме выбери человека из списка."); },
    async signUp(name) {
      const id = uid(); db.profiles.push({ id, name, role: "member", approved: false, depts: [] }); persist();
      session = id; lsSet(SKEY, id); return { needsConfirm: false };
    },
    async signOut() { session = null; lsSet(SKEY, null); },
    async resetSend() {}, async resetConfirm() {},
    async resetDemo() { db = seed(); persist(); session = null; lsSet(SKEY, null); },
    demoPeople: () => db.profiles,
    allowed: {
      list: async () => JSON.parse(JSON.stringify(db.allowed || [])),
      add: async rows => { db.allowed = db.allowed || []; rows.forEach(r => { const i = db.allowed.findIndex(x => x.email === r.email); if (i >= 0) db.allowed[i] = r; else db.allowed.push(r); }); persist(); },
      remove: async email => { db.allowed = (db.allowed || []).filter(x => x.email !== email); persist(); }
    },
    profiles: tbl("profiles"), meetings: tbl("meetings"), tasks: tbl("tasks"), ideas: tbl("ideas"),
    subscribe(cb) { onChange = cb; },
    onAuth() {}
  };
}

const store = DEMO ? demoStore() : supabaseStore();

/* =====================================================================
   STATE
   ===================================================================== */
const S = { meId: null, me: null, profiles: [], meetings: [], tasks: [], ideas: [] };
const UI = { view: "plan", month: null, meetF: "all", taskF: "mine", dept: "", sheet: null };
let seen = new Set();

const byId = id => S.profiles.find(p => p.id === id);
const approved = () => S.profiles.filter(p => p.approved).sort((a, b) => a.name.localeCompare(b.name, "ru"));
const nameOf = id => byId(id)?.name || "—";
const isEditor = () => !!S.me && S.me.approved && (S.me.role === "admin" || S.me.role === "leader");
const isAdmin = () => !!S.me && S.me.approved && S.me.role === "admin";
const canEditMeeting = m => isEditor() || m.coord_id === S.meId;
const canEditTask = t => isEditor() || t.created_by === S.meId || (t.assignees || []).includes(S.meId);
const canDeleteTask = t => isEditor() || t.created_by === S.meId;
const canEditIdea = i => isEditor() || i.author === S.meId;
const mine = t => (t.assignees || []).includes(S.meId);

function av(id, cls = "") { const p = byId(id); return `<span class="av ${colorOf(id)} ${cls}" aria-hidden="true">${esc(initials(p?.name))}</span>`; }

async function loadTable(n) {
  try {
    const rows = await store[n].list();
    if (n === "meetings") rows.sort((a, b) => a.date.localeCompare(b.date));
    if (n === "tasks") rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    S[n] = rows;
    if (n === "profiles") S.me = byId(S.meId) || null;
  } catch (e) { toast(ruError(e), true); }
}
async function loadAll() { await Promise.all(["profiles", "meetings", "tasks", "ideas"].map(loadTable)); }

/* =====================================================================
   SCREENS
   ===================================================================== */
function show(id) { ["loading", "auth", "pending", "app"].forEach(x => { $("#" + x).hidden = x !== id; }); }

function logoHtml() {
  const name = esc(CFG.appName || "Молодёжка. Среды").replace(".", "<span>.</span>");
  return `<div class="logo"><div class="logo-mark">Ср</div><h1>${name}</h1></div>`;
}

function renderAuth(mode = "in", msg = "") {
  show("auth");
  if (store.demo) {
    const ppl = store.demoPeople();
    $("#auth").innerHTML = `${logoHtml()}
      <div class="demo-banner">Демо-режим: база ещё не подключена. Выбери, под кем войти, чтобы посмотреть, как это работает у разных людей.</div>
      <div class="auth-card"><span class="eyebrow" style="color:var(--blue)">Войти как</span>
        <div class="demo-users">${ppl.map(p => `<button class="demo-user" data-demo="${p.id}">${`<span class="av lg ${colorOf(p.id)}">${esc(initials(p.name))}</span>`}<span><b>${esc(p.name)}</b><small>${p.approved ? ROLES[p.role] : "Ждёт подтверждения"}${p.depts?.length ? " · " + esc(p.depts.join(", ")) : ""}</small></span></button>`).join("")}</div>
        <button class="btn ghost" id="demoReset">Сбросить демо-данные</button>
      </div>`;
    return;
  }
  const isUp = mode === "up", isReset = mode === "reset", isCode = mode === "code";
  let body;
  if (isReset || isCode) {
    body = `<p class="muted">${isReset ? "Пришлём код на почту. Введи его здесь вместе с новым паролем." : "Введи код из письма и новый пароль."}</p>
      <label class="f" for="a-email">Почта<input id="a-email" type="email" autocomplete="email" inputmode="email" value="${esc(renderAuth.email || "")}"></label>
      ${isCode ? `<label class="f" for="a-code">Код из письма<input id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>
      <label class="f" for="a-pass">Новый пароль<input id="a-pass" type="password" autocomplete="new-password"></label>` : ""}
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" id="a-go">${isReset ? "Отправить код" : "Сменить пароль и войти"}</button>
      <button class="link" data-mode="in">Назад ко входу</button>`;
  } else {
    body = `<div class="seg" role="group" aria-label="Вход или регистрация"><button data-mode="in" aria-pressed="${!isUp}">Вход</button><button data-mode="up" aria-pressed="${isUp}">Регистрация</button></div>
      ${isUp ? `<label class="f" for="a-name">Имя и фамилия<input id="a-name" autocomplete="name" placeholder="Как тебя знают в команде"></label>` : ""}
      <label class="f" for="a-email">Почта<input id="a-email" type="email" autocomplete="email" inputmode="email" value="${esc(renderAuth.email || "")}"></label>
      <label class="f" for="a-pass">Пароль<input id="a-pass" type="password" autocomplete="${isUp ? "new-password" : "current-password"}" placeholder="${isUp ? "Не короче 6 символов" : ""}"></label>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" id="a-go">${isUp ? "Создать аккаунт" : "Войти"}</button>
      ${isUp ? `<p class="muted">После регистрации админ подтвердит, что ты из команды, и откроется доступ.</p>` : `<button class="link" data-mode="reset">Забыли пароль?</button>`}`;
  }
  $("#auth").innerHTML = `${logoHtml()}<p class="lead">План сред, задачи и команда молодёжного служения.</p><div class="auth-card" data-cur="${mode}">${body}</div>`;
}

function renderPending() {
  show("pending");
  $("#pending").innerHTML = `${logoHtml()}
    <div class="auth-card"><span class="eyebrow" style="color:var(--blue)">Почти готово</span>
      <h2 style="font-size:20px;font-weight:900">Привет, ${esc(S.me?.name || "")}!</h2>
      <p class="muted" style="font-size:14px">Аккаунт создан. Админ должен подтвердить, что ты из команды. Как только это случится, нажми «Проверить» — откроется план сред и твои задачи.</p>
      <button class="btn" id="p-check">Проверить</button>
      <button class="btn ghost" id="p-out">Выйти</button>
    </div>`;
}

/* =====================================================================
   APP RENDER
   ===================================================================== */
function readiness(m) {
  const items = [["Формат", !!m.format], ["Тема", !!m.theme], ["Координатор", !!m.coord_id], ["Спикер", !!m.speaker], ["Тема у прославления", !!m.w_sent], ["Согласовано с Катариной", !!m.w_agreed]];
  return { items, p: Math.round(items.filter(i => i[1]).length / items.length * 100) };
}
const deadline = m => { const d = pd(m.date); d.setDate(d.getDate() - 7); return d; };

/* ---------- регламент ---------- */
const SCHED_TEMPLATE = m => [
  { t: m.prep || "17:30", what: "Приходим готовить зал", who: [], note: "" },
  { t: "", what: "Дежурные", who: [], note: "" },
  { t: m.start || "18:30", what: "Начало, открывает", who: [], note: "" },
  { t: "18:35", what: "2 песни", who: [], note: "" },
  { t: "19:45", what: "Молитва и слово", who: [], note: "" },
  { t: "20:30", what: "Общение / чай-пай", who: [], note: "" },
  { t: "21:00", what: "Конец", who: [], note: "" }
];
const sched = m => Array.isArray(m.schedule) ? m.schedule : [];
const schedWho = it => [...(it.who || []).filter(byId).map(id => id === S.meId ? "я" : nameOf(id)), ...(it.note ? [it.note] : [])].join(", ");
function schedText(m) {
  const head = cap(fmtD(m.date, { weekday: "short", day: "2-digit", month: "2-digit" })) + (m.theme ? " · " + m.theme : "") + "\nРегламент:";
  return head + "\n" + sched(m).map(it => {
    const who = [...(it.who || []).filter(byId).map(nameOf), ...(it.note ? [it.note] : [])].join(", ");
    return `${it.t ? it.t + " " : ""}${it.what}${who ? (/[:—-]\s*$/.test(it.what) ? " " : ": ") + who : ""}`;
  }).join("\n");
}
// пункты регламента ближайших встреч, где отмечен я
const mySched = () => S.meetings.filter(m => pd(m.date) >= today() && active(m))
  .flatMap(m => sched(m).filter(it => (it.who || []).includes(S.meId)).map(it => ({ m, it })));
const stClass = s => ({ "Готово": "st-ready", "В работе": "st-work", "Проведено": "st-done", "Перенос / отмена": "st-off" }[s] || "");
const active = m => m.status !== "Перенос / отмена";
const upcoming = () => S.meetings.filter(m => pd(m.date) >= today() && active(m))[0];

function renderHeader() {
  $("#appTitle").innerHTML = esc(CFG.appName || "Молодёжка. Среды").replace(".", "<span>.</span>");
  $("#todayLbl").textContent = cap(today().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })) + (store.demo ? " · демо" : "");
  $("#meBtn").innerHTML = av(S.meId, "lg");
  const m = upcoming();
  if (!m) { $("#hero").innerHTML = `<span class="eyebrow">Ближайшая встреча</span><div class="hero-date">Пока не запланирована</div>`; return; }
  const dl = days(deadline(m), today()), r = readiness(m), dd = days(pd(m.date), today());
  const dlTxt = dl > 0 ? `до дедлайна ${dl} дн.` : dl === 0 ? "дедлайн сегодня" : `дедлайн прошёл ${-dl} дн. назад`;
  $("#hero").innerHTML = `<span class="eyebrow">Ближайшая встреча · ${dd === 0 ? "сегодня" : dd === 1 ? "завтра" : "через " + dd + " дн."}</span>
    <div class="hero-date">${esc(cap(fmtD(m.date, { weekday: "long" })))},<br>${esc(fmtD(m.date, { day: "numeric", month: "long" }))}</div>
    <div class="hero-meta">${m.prep ? `<span class="pill">Подготовка ${esc(m.prep)}</span>` : ""}${m.start ? `<span class="pill lime">Начало ${esc(m.start)}</span>` : ""}<span class="pill">Готово ${r.p}%</span>${m.coord_id ? `<span class="pill">Коорд.: ${esc(nameOf(m.coord_id))}</span>` : ""}</div>
    ${(() => { const myIt = sched(m).filter(it => (it.who || []).includes(S.meId)); return myIt.length ? `<div class="hero-me">Ты в регламенте: ${myIt.map(it => esc((it.t ? it.t + " " : "") + it.what)).join(" · ")}</div>` : ""; })()}
    <div class="hero-row"><div class="hero-theme">${esc(m.theme || m.notes || "Тема ещё не выбрана")}<small>${dlTxt}</small></div>
      <div style="display:flex;gap:6px">${sched(m).length ? `<button class="hero-open lime" data-open="${m.id}" data-pane="sched">Регламент</button>` : ""}<button class="hero-open" data-open="${m.id}">Открыть</button></div></div>`;
}

function renderPlan() {
  const fut = S.meetings.filter(m => pd(m.date) >= today() && active(m));
  const myOpen = S.tasks.filter(t => mine(t) && !t.done).length;
  $("#stats").innerHTML = `<div class="stat"><b>${fut.length}</b><span>встреч впереди</span></div>
    <div class="stat"><b>${fut.filter(m => !m.theme).length}</b><span>без темы</span></div>
    <button class="stat ${myOpen ? "hot" : ""}" data-goto="tasks"><b>${myOpen}</b><span>моих задач</span></button>`;

  const tipOff = lsGet("sredy-tip-off", false);
  $("#installTip").innerHTML = !isStandalone() && !tipOff ? `<div class="install"><div style="flex:1"><b>Установи на телефон</b><p>iPhone: Safari → «Поделиться» → «На экран Домой». Android: Chrome → ⋮ → «Установить приложение».</p></div><button id="tipOff">Скрыть</button></div>` : "";

  const keys = [...new Set(S.meetings.map(m => monthKey(m.date)))].sort();
  if (!UI.month || !keys.includes(UI.month)) { const u = upcoming(); UI.month = u ? monthKey(u.date) : keys[keys.length - 1]; }
  const myCount = S.meetings.filter(m => m.coord_id === S.meId && pd(m.date) >= today()).length;
  $("#months").innerHTML = `<button class="chip mine" aria-pressed="${UI.meetF === "mine"}" data-meetf="${UI.meetF === "mine" ? "all" : "mine"}">Я координирую${myCount ? ` <span class="n">${myCount}</span>` : ""}</button>` +
    (UI.meetF === "mine" ? "" : keys.map(k => `<button class="chip" aria-pressed="${k === UI.month}" data-month="${k}">${monthName(k)}</button>`).join(""));

  const list = UI.meetF === "mine" ? S.meetings.filter(m => m.coord_id === S.meId && pd(m.date) >= today()) : S.meetings.filter(m => monthKey(m.date) === UI.month);
  $("#meetList").innerHTML = list.length ? list.map(meetCard).join("") :
    `<div class="empty-box">${UI.meetF === "mine" ? "Ты пока не координируешь ни одну встречу." : "В этом месяце встреч нет."}</div>`;
}

// компьютерная версия: колонка «Моё» рядом с планом
function renderPlanSide() {
  const box = $("#planSide"); if (!box) return;
  const myTasks = S.tasks.filter(t => mine(t) && !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const ms = mySched();
  const myMeet = S.meetings.filter(m => m.coord_id === S.meId && pd(m.date) >= today() && active(m));
  box.innerHTML = `
    <div class="side-card"><div class="sec-h"><h2>Мои задачи</h2><button class="link" data-goto="tasks">Все</button></div>
      ${myTasks.length ? myTasks.slice(0, 6).map(t => `<button class="side-row" data-task="${t.id}"><span class="side-dot ${t.due && pd(t.due) < today() ? "late" : ""}"></span><span class="side-txt">${esc(t.title)}${t.due ? `<small>до ${short(t.due)}${t.dept ? " · " + esc(t.dept) : ""}</small>` : t.dept ? `<small>${esc(t.dept)}</small>` : ""}</span>${!seen.has(t.id) ? `<span class="tag new">Новая</span>` : ""}</button>`).join("") + (myTasks.length > 6 ? `<p class="muted">и ещё ${myTasks.length - 6}</p>` : "") : `<p class="muted">Открытых задач нет.</p>`}
    </div>
    <div class="side-card"><div class="sec-h"><h2>Я в регламенте</h2></div>
      ${ms.length ? ms.map(({ m, it }) => `<button class="side-row" data-open="${m.id}" data-pane="sched"><span class="side-time">${esc(it.t || "—")}</span><span class="side-txt">${esc(it.what)}<small>${esc(cap(fmtD(m.date, { weekday: "short", day: "2-digit", month: "2-digit" })))}</small></span></button>`).join("") : `<p class="muted">Тебя пока не отметили в регламенте.</p>`}
    </div>
    ${myMeet.length ? `<div class="side-card"><div class="sec-h"><h2>Я координирую</h2></div>${myMeet.map(m => `<button class="side-row" data-open="${m.id}"><span class="side-time">${pd(m.date).getDate()}.${String(pd(m.date).getMonth() + 1).padStart(2, "0")}</span><span class="side-txt">${esc(m.theme || "Тема не выбрана")}<small>готовность ${readiness(m).p}%</small></span></button>`).join("")}</div>` : ""}`;
}

function meetCard(m) {
  const r = readiness(m), dl = days(deadline(m), today()), isSat = pd(m.date).getDay() !== 3, past = pd(m.date) < today();
  const taskN = S.tasks.filter(t => t.meeting_id === m.id && !t.done).length;
  const dlTxt = past || m.status === "Проведено" ? "встреча прошла" : dl < 0 ? `<span class="late-t">дедлайн прошёл</span>` : `готово к ${deadline(m).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`;
  return `<button class="card ${m.coord_id === S.meId ? "mine" : ""}" data-open="${m.id}">
    <div class="date-box ${isSat ? "sat" : ""}"><b>${pd(m.date).getDate()}</b><span>${esc(fmtD(m.date, { weekday: "short" }).replace(".", ""))}</span></div>
    <div><h3 class="${m.theme ? "" : "empty"}">${esc(m.theme || "Тема не выбрана")}</h3>
      <div class="tags">${m.format ? `<span class="tag fmt">${esc(FMT_SHORT[m.format] || m.format)}</span>` : `<span class="tag">Формат?</span>`}
      <span class="tag">${m.coord_id ? (m.coord_id === S.meId ? "Коорд.: я" : "Коорд.: " + esc(nameOf(m.coord_id))) : "Координатор?"}</span>
      <span class="tag ${stClass(m.status)}">${esc(m.status)}</span>${taskN ? `<span class="tag">Задач: ${taskN}</span>` : ""}${sched(m).length ? `<span class="tag">Регламент ✓</span>` : ""}${sched(m).some(it => (it.who || []).includes(S.meId)) ? `<span class="tag new">Я в регламенте</span>` : ""}</div>
      <div class="bar"><i class="${r.p === 100 ? "full" : ""}" style="width:${r.p}%"></i></div>
      <div class="card-foot"><span>Готовность ${r.p}%</span><span>${dlTxt}</span></div>
    </div></button>`;
}

function taskRow(t) {
  const late = t.due && !t.done && pd(t.due) < today();
  const isNew = mine(t) && !t.done && !seen.has(t.id);
  const ms = t.meeting_id && S.meetings.find(m => m.id === t.meeting_id);
  const who = (t.assignees || []).filter(byId);
  const whoTxt = who.length ? who.map(id => id === S.meId ? "я" : nameOf(id)).join(", ") : "никто не отмечен";
  return `<div class="task ${t.done ? "done" : ""} ${isNew ? "is-new" : ""}">
    <button class="check" data-toggle="${t.id}" ${canEditTask(t) ? "" : "disabled"} aria-label="${t.done ? "Вернуть в работу" : "Отметить выполненной"}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0E0E10" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></button>
    <button class="t-body" data-task="${t.id}"><div class="t-title">${esc(t.title)}</div>
      <div class="tags">${isNew ? `<span class="tag new">Новая</span>` : ""}${t.dept ? `<span class="tag fmt">${esc(t.dept)}</span>` : ""}${t.due ? `<span class="tag ${late ? "late" : ""}">до ${short(t.due)}</span>` : ""}${ms ? `<span class="tag">к встрече ${short(ms.date)}</span>` : ""}</div>
      <div class="t-foot"><span class="t-who"><span class="stack">${who.slice(0, 4).map(id => av(id)).join("")}</span><span>${esc(whoTxt)}</span></span></div>
    </button></div>`;
}

function renderTasks() {
  const myOpen = S.tasks.filter(t => mine(t) && !t.done);
  const F = [["mine", "Мои", myOpen.length], ["all", "Все открытые"], ["byme", "Я поставил"], ["done", "Готово"]];
  $("#taskFilter").innerHTML = F.map(([k, l, n]) => `<button class="chip" aria-pressed="${k === UI.taskF}" data-tf="${k}">${l}${n ? ` <span class="n">${n}</span>` : ""}</button>`).join("");
  const depts = [...new Set([...DEPTS, ...S.tasks.map(t => t.dept).filter(Boolean)])];
  $("#deptFilter").innerHTML = `<option value="">Все отделы</option>` + depts.map(d => `<option ${d === UI.dept ? "selected" : ""}>${esc(d)}</option>`).join("");
  let list = S.tasks.slice();
  if (UI.taskF === "mine") list = list.filter(t => mine(t) && !t.done);
  if (UI.taskF === "all") list = list.filter(t => !t.done);
  if (UI.taskF === "byme") list = list.filter(t => t.created_by === S.meId);
  if (UI.taskF === "done") list = list.filter(t => t.done);
  if (UI.dept) list = list.filter(t => t.dept === UI.dept);
  list.sort((a, b) => (a.done - b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
  const empty = { mine: "У тебя нет открытых задач. Отдыхай или возьми что-нибудь из «Все открытые».", all: "Открытых задач нет.", byme: "Ты пока не ставил задач.", done: "Выполненных задач пока нет." }[UI.taskF];
  const ms = UI.taskF === "mine" ? mySched() : [];
  const schedBlock = ms.length ? `<div class="my-sched"><span class="eyebrow">Я в регламенте</span>${ms.map(({ m, it }) => `
    <button class="ms-row" data-open="${m.id}" data-pane="sched"><span class="ms-date">${esc(cap(fmtD(m.date, { weekday: "short", day: "2-digit", month: "2-digit" })))}</span><span class="ms-t">${esc(it.t || "—")}</span><span class="ms-what">${esc(it.what)}</span></button>`).join("")}</div>` : "";
  $("#taskList").innerHTML = schedBlock + (list.length ? list.map(taskRow).join("") : `<div class="empty-box">${empty}</div>`);
}

function renderTeam() {
  const pend = S.profiles.filter(p => !p.approved);
  $("#pendingList").innerHTML = isAdmin() && pend.length ? `<div class="sec-h"><h2>Ждут подтверждения</h2></div>` + pend.map(p => `
    <div class="person pending">${av(p.id, "lg")}<div class="info"><b>${esc(p.name)}</b><small>Зарегистрировался, ждёт доступа</small></div>
    <div class="person-actions"><button class="btn-s" data-approve="${p.id}">Пустить</button><button class="btn-s ghost" data-reject="${p.id}">Удалить</button></div></div>`).join("") : "";
  $("#teamList").innerHTML = (CFG.team || []).map(t => `<div class="team ${t.need ? "need" : ""}"><div class="team-top"><h3>${esc(t.dept)}</h3>${t.need ? '<span class="need-badge">Нужен человек</span>' : ""}</div><div class="who">${esc(t.who)}</div>${t.note ? `<p>${esc(t.note)}</p>` : ""}</div>`).join("");
  renderAllowed();
  const ppl = approved();
  $("#peopleCount").textContent = ppl.length + " чел.";
  $("#peopleList").innerHTML = ppl.map(p => {
    const open = S.tasks.filter(t => (t.assignees || []).includes(p.id) && !t.done).length;
    const roleCtl = isAdmin() && p.id !== S.meId
      ? `<select class="mini" data-role="${p.id}" aria-label="Роль: ${esc(p.name)}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === p.role ? "selected" : ""}>${v}</option>`).join("")}</select>`
      : `<span class="tag ${p.role === "admin" ? "st-work" : p.role === "leader" ? "fmt" : ""}">${ROLES[p.role]}</span>`;
    return `<div class="person">${av(p.id, "lg")}<div class="info"><b>${esc(p.name)}${p.id === S.meId ? " (я)" : ""}</b><small>${esc((p.depts || []).join(", ") || "Отдел не указан")} · задач: ${open}</small></div>${roleCtl}</div>`;
  }).join("");
  const pn = isAdmin() ? pend.length : 0;
  $("#teamBadge").hidden = !pn; $("#teamBadge").textContent = pn;
}

let allowedRows = null;
async function loadAllowed() { if (!isAdmin()) return; try { allowedRows = await store.allowed.list(); } catch (e) { allowedRows = []; } renderAllowed(); }
function renderAllowed() {
  const box = $("#allowedBox"); if (!box) return;
  if (!isAdmin()) { box.innerHTML = ""; return; }
  if (allowedRows === null) { box.innerHTML = ""; loadAllowed(); return; }
  box.innerHTML = `<div class="sec-h"><h2>Список команды</h2><span class="muted">${allowedRows.length} почт</span></div>
    <div class="group"><p class="muted">Кто есть в этом списке, регистрируется на сайте сам, со своим паролем, и сразу получает доступ. Вставь строки вида <b>Имя — почта</b>, по одной на строку.</p>
      <label class="f" for="al-text">Почты<textarea id="al-text" placeholder="Аня — anya@gmail.com&#10;Виталик — vitalik@mail.ru"></textarea></label>
      <label class="f" for="al-role">Роль для этих людей<select id="al-role"><option value="member">Участник</option><option value="leader">Лидер</option></select></label>
      <button class="btn dark" id="al-add">Добавить в список</button><p class="err" id="al-err"></p>
      ${allowedRows.length ? `<div class="al-list">${allowedRows.map(a => `<div class="al-row"><div><b>${esc(a.name || a.email.split("@")[0])}</b><small>${esc(a.email)} · ${ROLES[a.role] || a.role}</small></div><button class="btn-s ghost" data-al-del="${esc(a.email)}">Убрать</button></div>`).join("")}</div>` : ""}
    </div>`;
}
function parseAllowed(text, role) {
  const rows = [], bad = [];
  text.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
    const m = line.match(/[^\s<>,;:()]+@[^\s<>,;:()]+\.[^\s<>,;:()]+/);
    if (!m) { bad.push(line); return; }
    const email = m[0].toLowerCase();
    const name = line.replace(m[0], "").replace(/[<>()]/g, "").replace(/^[\s—–\-:,;|]+|[\s—–\-:,;|]+$/g, "").trim();
    rows.push({ email, name, role });
  });
  return { rows, bad };
}

function renderIdeas() {
  $("#ideaList").innerHTML = S.ideas.map(i => `<div class="team"><div class="team-top"><h3>${esc(i.title)}</h3>
    ${canEditIdea(i) ? `<select class="mini" data-idea-st="${i.id}" aria-label="Статус идеи">${IDEA_ST.map(s => `<option ${s === i.status ? "selected" : ""}>${s}</option>`).join("")}</select>` : `<span class="tag ${i.status === "Есть" ? "st-ready" : "fmt"}">${esc(i.status)}</span>`}</div>
    ${i.descr ? `<p>${esc(i.descr)}</p>` : ""}<p>Предложил(а): ${esc(i.by_name || nameOf(i.author))}</p>
    ${canEditIdea(i) && i.author ? `<button class="link" style="align-self:flex-start" data-idea-del="${i.id}">Удалить</button>` : ""}</div>`).join("") || `<div class="empty-box">Идей пока нет.</div>`;
}

function renderBadges() {
  const n = S.tasks.filter(t => mine(t) && !t.done).length;
  $("#taskBadge").hidden = !n; $("#taskBadge").textContent = n;
}

function renderApp() {
  if (!S.me) return;
  renderHeader(); renderPlan(); renderPlanSide(); renderTasks(); renderTeam(); renderIdeas(); renderBadges();
  $("#fab").hidden = (UI.view === "plan" && !isEditor()) || UI.view === "team";
}

function setView(v) {
  UI.view = v;
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.v === v));
  $("#fab").hidden = (v === "plan" && !isEditor()) || v === "team";
  $("#fab").setAttribute("aria-label", { plan: "Добавить встречу", tasks: "Добавить задачу", ideas: "Предложить идею" }[v] || "Добавить");
  window.scrollTo(0, 0);
}

/* =====================================================================
   SHEETS
   ===================================================================== */
function openSheet(kind, title, sub, html) {
  UI.sheet = kind;
  $("#sheetTitle").textContent = title; $("#sheetSub").textContent = sub || "";
  $("#sheetBody").innerHTML = html; $("#sheetBody").oninput = null; $("#sheetBody").onchange = null; $("#sheetBody").onclick = null;
  $("#sheet").classList.add("on"); $("#scrim").classList.add("on"); $("#sheetBody").scrollTop = 0;
}
async function closeSheet() {
  if (UI.flush) { await UI.flush(); UI.flush = null; }
  UI.sheet = null; $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); renderApp();
}
const opt = (arr, v, ph) => (ph != null ? `<option value="">${ph}</option>` : "") + arr.map(a => Array.isArray(a) ? `<option value="${esc(a[0])}" ${a[0] === v ? "selected" : ""}>${esc(a[1])}</option>` : `<option ${a === v ? "selected" : ""}>${esc(a)}</option>`).join("");
const fld = (id, label, v, type = "text", dis = false, extra = "") => `<label class="f" for="${id}">${label}<input id="${id}" type="${type}" value="${esc(v ?? "")}" ${dis ? "disabled" : ""} ${extra}></label>`;
const ta = (id, label, v, dis = false) => `<label class="f" for="${id}">${label}<textarea id="${id}" ${dis ? "disabled" : ""}>${esc(v ?? "")}</textarea></label>`;
const readyHtml = m => { const r = readiness(m); return `<div class="ring ${r.p === 100 ? "full" : ""}" style="--p:${r.p}"><b>${r.p}%</b></div><div class="ready-list">${r.items.map(i => `<span class="${i[1] ? "ok" : "no"}">${i[1] ? "✓" : "○"} ${i[0]}</span>`).join("")}</div>`; };
const pickPeople = (sel, dis) => `<div class="pick" id="pickPeople">${approved().map(p => `<button type="button" data-pick="${p.id}" aria-pressed="${sel.includes(p.id)}" ${dis ? "disabled" : ""}>${av(p.id)}${esc(p.id === S.meId ? "Я" : p.name)}</button>`).join("")}</div>`;

function openMeeting(id, pane) {
  const m = S.meetings.find(x => x.id === id); if (!m) return;
  m.schedule = sched(m).map(it => ({ t: it.t || "", what: it.what || "", who: [...(it.who || [])], note: it.note || "" }));
  pane = pane || UI.lastPane || "prep";
  const ed = canEditMeeting(m), dis = !ed;
  const dl = deadline(m).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const tasks = S.tasks.filter(t => t.meeting_id === m.id);
  let openPicker = -1;
  openSheet("meeting", cap(fmtD(m.date, { weekday: "long", day: "numeric", month: "long" })), ed ? "" : "Только просмотр", `
  <div class="seg light" role="tablist" aria-label="Раздел встречи"><button role="tab" data-pane-btn="prep" aria-pressed="${pane === "prep"}">Подготовка</button><button role="tab" data-pane-btn="sched" aria-pressed="${pane === "sched"}">Регламент</button></div>
  ${dis ? `<p class="ro-note">Менять встречу могут админ, лидеры и координатор этой встречи.</p>` : ""}
  <div id="pane-sched" ${pane === "sched" ? "" : "hidden"} style="display:flex;flex-direction:column;gap:14px">
    <div class="group" id="schedBox"></div>
    <button class="btn lime" id="sch-copy">Скопировать регламент для чата</button>
  </div>
  <div id="pane-prep" ${pane === "prep" ? "" : "hidden"} style="display:flex;flex-direction:column;gap:14px">
  <div class="group"><div class="ready-box" id="readyBox">${readyHtml(m)}</div><p class="muted">Всё должно быть готово к ${dl}. <span class="save-state" id="saveState"></span></p></div>
  <div class="group"><span class="eyebrow">Основное</span>
    <label class="f" for="m-format">Формат<select id="m-format" ${dis ? "disabled" : ""}>${opt(FORMATS, m.format, "Выбрать формат")}</select></label>
    ${fld("m-theme", "Тема", m.theme, "text", dis)}
    ${fld("m-passage", "Основа / отрывок Писания", m.passage, "text", dis)}
    ${ta("m-goal", "Что ребята должны унести", m.goal, dis)}
    <div class="row2">${fld("m-prep", "Подготовка", m.prep, "time", dis)}${fld("m-start", "Начало", m.start, "time", dis)}</div>
  </div>
  <div class="group"><span class="eyebrow">Люди</span>
    <label class="f" for="m-coord">Координатор среды<select id="m-coord" ${isEditor() ? "" : "disabled"}>${opt(approved().map(p => [p.id, p.name]), m.coord_id || "", "Кто координирует?")}</select></label>
    ${fld("m-speaker", "Ведущий / спикер / гость", m.speaker, "text", dis)}
    ${fld("m-servants", "Служители (интервью, свидетельство, игры)", m.servants, "text", dis)}
  </div>
  <div class="group"><span class="eyebrow">Прославление · Катарина</span>
    <label class="toggle" for="m-wsent">Тема передана прославлению<input class="sw" type="checkbox" id="m-wsent" ${m.w_sent ? "checked" : ""} ${dis ? "disabled" : ""}></label>
    <label class="toggle" for="m-wagreed">Согласовано с Катариной<input class="sw" type="checkbox" id="m-wagreed" ${m.w_agreed ? "checked" : ""} ${dis ? "disabled" : ""}></label>
  </div>
  <div class="group"><span class="eyebrow">Задачи к встрече</span>
    ${tasks.length ? tasks.map(t => `<button class="t-body" data-task="${t.id}" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span class="t-title" style="${t.done ? "text-decoration:line-through;color:var(--ink-2)" : ""}">${esc(t.title)}</span><span class="stack">${(t.assignees || []).filter(byId).slice(0, 3).map(i => av(i)).join("")}</span></button>`).join("") : `<p class="muted">Пока нет задач.</p>`}
    <button class="btn ghost" data-newtask-for="${m.id}">Добавить задачу к встрече</button>
  </div>
  <div class="group"><span class="eyebrow">Отделы</span>
    ${fld("m-welcome", "Welcome", m.welcome, "text", dis)}
    ${fld("m-groups", "Домашние группы / ученичество", m.groups, "text", dis)}
    ${fld("m-org", "Организация и чай-пай", m.org, "text", dis)}
    ${fld("m-slides", "Слайды", m.slides, "text", dis)}
    ${fld("m-media", "Медиа", m.media, "text", dis)}
    ${fld("m-budget", "Бюджет, сум (Юля)", m.budget, "text", dis, 'inputmode="numeric"')}
  </div>
  <div class="group"><span class="eyebrow">Статус и заметки</span>
    <label class="f" for="m-status">Статус<select id="m-status" ${dis ? "disabled" : ""}>${opt(STATUSES, m.status)}</select></label>
    ${ta("m-notes", "Заметки", m.notes, dis)}
  </div>
  ${isEditor() ? `<button class="btn danger" id="m-del">Удалить встречу</button>` : ""}
  </div>`);

  /* --- регламент --- */
  const whoChips = (it, i) => (it.who || []).filter(byId).map(pid => `<span class="who-chip">${av(pid)}${esc(pid === S.meId ? "Я" : nameOf(pid))}${ed ? `<button type="button" data-sch-unpick="${i}|${pid}" aria-label="Убрать ${esc(nameOf(pid))}">×</button>` : ""}</span>`).join("");
  function renderSched() {
    const rows = m.schedule;
    const head = `<div class="sch-head"><span class="eyebrow">Регламент по времени</span><span class="save-state" id="saveState2"></span></div>`;
    if (!ed) {
      $("#schedBox").innerHTML = head + (rows.length ? `<div class="tl">${rows.map(it => `<div class="tl-row ${(it.who || []).includes(S.meId) ? "me" : ""}"><b>${esc(it.t || "")}</b><div><div class="tl-what">${esc(it.what)}</div>${(it.who || []).length || it.note ? `<div class="tl-who">${(it.who || []).filter(byId).map(pid => `<span class="who-chip">${av(pid)}${esc(pid === S.meId ? "Я" : nameOf(pid))}</span>`).join("")}${it.note ? `<span class="who-note">${esc(it.note)}</span>` : ""}</div>` : ""}</div></div>`).join("")}</div>` : `<p class="muted">Регламент ещё не составлен.</p>`);
      return;
    }
    $("#schedBox").innerHTML = head + (rows.length ? rows.map((it, i) => `
      <div class="sch-row ${(it.who || []).includes(S.meId) ? "me" : ""}">
        <div class="sch-line">
          <input class="sch-t" type="time" data-i="${i}" data-k="t" value="${esc(it.t)}" aria-label="Время">
          <input class="sch-what" data-i="${i}" data-k="what" value="${esc(it.what)}" placeholder="Что происходит" aria-label="Пункт регламента">
          <button type="button" class="sch-del" data-sch-del="${i}" aria-label="Удалить пункт">×</button>
        </div>
        <div class="sch-people">${whoChips(it, i)}<button type="button" class="sch-add-who" data-sch-picker="${i}">${openPicker === i ? "Готово" : "+ Отметить"}</button></div>
        ${openPicker === i ? `<div class="pick">${approved().map(p => `<button type="button" data-sch-pick="${i}|${p.id}" aria-pressed="${(it.who || []).includes(p.id)}">${av(p.id)}${esc(p.id === S.meId ? "Я" : p.name)}</button>`).join("")}</div>` : ""}
        <input class="sch-note" data-i="${i}" data-k="note" value="${esc(it.note)}" placeholder="Гость или кто ещё" aria-label="Кто ещё">
      </div>`).join("") : `<p class="muted">Пока пусто. Начни с типового регламента или добавь пункты сам.</p>`) +
      `<div class="sch-actions"><button type="button" class="btn ghost" data-sch-add>+ Пункт</button>${rows.length ? `<button type="button" class="btn ghost" data-sch-sort>По времени</button>` : `<button type="button" class="btn dark" data-sch-tpl>Типовой регламент</button>`}</div>`;
  }
  renderSched();

  const map = { format: "m-format", theme: "m-theme", passage: "m-passage", goal: "m-goal", prep: "m-prep", start: "m-start", coord_id: "m-coord", speaker: "m-speaker", servants: "m-servants", welcome: "m-welcome", groups: "m-groups", org: "m-org", slides: "m-slides", media: "m-media", budget: "m-budget", status: "m-status", notes: "m-notes" };
  let pending = {}, timer = null;
  const setState = t => { ["#saveState", "#saveState2"].forEach(s => { const el = $(s); if (el) el.textContent = t; }); };
  const flush = async () => {
    clearTimeout(timer);
    const p = pending; pending = {};
    if (!Object.keys(p).length) return;
    setState("Сохраняю…");
    try { await store.meetings.update(m.id, p); setState("Сохранено"); }
    catch (e) { toast(ruError(e), true); setState("Не сохранилось"); }
  };
  UI.flush = flush;
  const queue = (key, val) => { m[key] = val; pending[key] = key === "schedule" ? JSON.parse(JSON.stringify(val)) : val; setState("…"); clearTimeout(timer); timer = setTimeout(flush, 700); };
  const sync = e => {
    const el = e.target; if (el.disabled) return;
    if (el.dataset.k && el.dataset.i != null) { m.schedule[+el.dataset.i][el.dataset.k] = el.value; return queue("schedule", m.schedule); }
    if (!el.id) return;
    let key = Object.keys(map).find(k => map[k] === el.id), val;
    if (el.id === "m-wsent") { key = "w_sent"; val = el.checked; }
    else if (el.id === "m-wagreed") { key = "w_agreed"; val = el.checked; }
    else if (key) val = key === "coord_id" ? (el.value || null) : el.value;
    if (!key) return;
    queue(key, val);
    $("#readyBox").innerHTML = readyHtml(m);
  };
  $("#sheetBody").oninput = sync; $("#sheetBody").onchange = sync;
  const tmin = s => { const [h, mm] = String(s).split(":").map(Number); return h * 60 + mm; };
  $("#sheetBody").onclick = e => {
    const t = e.target;
    const pb = t.closest("[data-pane-btn]");
    if (pb) {
      UI.lastPane = pb.dataset.paneBtn;
      document.querySelectorAll("[data-pane-btn]").forEach(b => b.setAttribute("aria-pressed", b === pb));
      $("#pane-sched").hidden = UI.lastPane !== "sched"; $("#pane-prep").hidden = UI.lastPane !== "prep"; return;
    }
    if (t.closest("#sch-copy")) {
      const txt = schedText(m);
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast("Регламент скопирован")).catch(() => {
        openSheetText(txt);
      });
      return;
    }
    if (!ed) return;
    const del = t.closest("[data-sch-del]"); if (del) { m.schedule.splice(+del.dataset.schDel, 1); openPicker = -1; queue("schedule", m.schedule); return renderSched(); }
    if (t.closest("[data-sch-add]")) { const last = m.schedule[m.schedule.length - 1]; m.schedule.push({ t: "", what: "", who: [], note: "" }); openPicker = -1; queue("schedule", m.schedule); renderSched(); const ins = document.querySelectorAll(".sch-what"); ins[ins.length - 1]?.focus(); return; }
    if (t.closest("[data-sch-tpl]")) { m.schedule = SCHED_TEMPLATE(m); queue("schedule", m.schedule); return renderSched(); }
    if (t.closest("[data-sch-sort]")) {
      let last = -1; const keyed = m.schedule.map((it, i) => { if (it.t) last = tmin(it.t); return { it, k: last, i }; });
      keyed.sort((a, b) => a.k - b.k || a.i - b.i); m.schedule = keyed.map(x => x.it); queue("schedule", m.schedule); return renderSched();
    }
    const pk = t.closest("[data-sch-picker]"); if (pk) { openPicker = openPicker === +pk.dataset.schPicker ? -1 : +pk.dataset.schPicker; return renderSched(); }
    const pick = t.closest("[data-sch-pick]") || t.closest("[data-sch-unpick]");
    if (pick) {
      const [i, pid] = (pick.dataset.schPick || pick.dataset.schUnpick).split("|"); const it = m.schedule[+i];
      it.who = it.who.includes(pid) ? it.who.filter(x => x !== pid) : [...it.who, pid];
      queue("schedule", m.schedule); return renderSched();
    }
  };
  const delBtn = $("#m-del");
  if (delBtn) delBtn.onclick = async () => {
    if (!delBtn.classList.contains("armed")) { delBtn.classList.add("armed"); delBtn.textContent = "Точно удалить? Нажми ещё раз"; return; }
    try { UI.flush = null; await store.meetings.remove(m.id); toast("Встреча удалена"); closeSheet(); } catch (e) { toast(ruError(e), true); }
  };
}

// запасной вариант, если телефон не дал скопировать автоматически
function openSheetText(txt) {
  const box = document.createElement("textarea");
  box.className = "copybox"; box.value = txt; box.setAttribute("aria-label", "Текст регламента");
  const sb = $("#pane-sched"); if (!sb) return;
  sb.appendChild(box); box.select(); toast("Выдели текст и скопируй");
}

function openTask(id, presetMeeting) {
  const t = id ? S.tasks.find(x => x.id === id) : { title: "", dept: "", assignees: [], due: "", meeting_id: presetMeeting || null, note: "", done: false, created_by: S.meId };
  if (!t) return;
  const isNew = !id, ed = isNew || canEditTask(t), dis = !ed;
  if (id && mine(t)) { seen.add(id); lsSet("sredy-seen-" + S.meId, [...seen]); }
  const meetOpts = S.meetings.filter(m => pd(m.date) >= today() || m.id === t.meeting_id).map(m => [m.id, cap(fmtD(m.date, { weekday: "short", day: "2-digit", month: "2-digit" })) + (m.theme ? " · " + m.theme : "")]);
  let sel = [...(t.assignees || [])];
  openSheet("task", isNew ? "Новая задача" : "Задача", isNew ? "" : `Поставил(а): ${t.created_by ? nameOf(t.created_by) : "планёрка"}`, `
    ${dis ? `<p class="ro-note">Менять задачу могут автор, отмеченные люди и лидеры.</p>` : ""}
    <div class="group">
      ${fld("t-title", "Что нужно сделать", t.title, "text", dis)}
      <label class="f" for="t-dept">Отдел<select id="t-dept" ${dis ? "disabled" : ""}>${opt([...new Set([...DEPTS, t.dept].filter(Boolean))], t.dept, "Без отдела")}</select></label>
      <div class="row2">${fld("t-due", "Дедлайн", t.due || "", "date", dis)}<label class="f" for="t-meet">К встрече<select id="t-meet" ${dis ? "disabled" : ""}>${opt(meetOpts, t.meeting_id || "", "—")}</select></label></div>
    </div>
    <div class="group"><span class="eyebrow">Кому · отметь людей</span>${pickPeople(sel, dis)}<p class="muted">Отмеченные увидят задачу во вкладке «Мои».</p></div>
    <div class="group">${ta("t-note", "Комментарий", t.note, dis)}</div>
    <p class="err" id="t-err"></p>
    ${ed ? `<button class="btn" id="t-save">${isNew ? "Поставить задачу" : "Сохранить"}</button>` : ""}
    ${!isNew && ed ? `<button class="btn ${t.done ? "ghost" : "lime"}" id="t-done">${t.done ? "Вернуть в работу" : "Отметить выполненной"}</button>` : ""}
    ${!isNew && canDeleteTask(t) ? `<button class="btn danger" id="t-del">Удалить задачу</button>` : ""}`);
  $("#sheetBody").onclick = e => {
    const b = e.target.closest("[data-pick]"); if (!b || b.disabled) return;
    const pid = b.dataset.pick; sel = sel.includes(pid) ? sel.filter(x => x !== pid) : [...sel, pid];
    b.setAttribute("aria-pressed", sel.includes(pid));
  };
  const save = $("#t-save");
  if (save) save.onclick = async () => {
    const title = $("#t-title").value.trim(); if (!title) { $("#t-err").textContent = "Напиши, что нужно сделать."; return; }
    const row = { title, dept: $("#t-dept").value, due: $("#t-due").value || null, meeting_id: $("#t-meet").value || null, assignees: sel, note: $("#t-note").value };
    save.disabled = true;
    try {
      if (isNew) { await store.tasks.insert(Object.assign(row, { created_by: S.meId, done: false })); toast(sel.length ? "Задача поставлена: " + sel.map(i => i === S.meId ? "мне" : nameOf(i)).join(", ") : "Задача добавлена"); }
      else { await store.tasks.update(t.id, row); toast("Сохранено"); }
      await loadTable("tasks"); closeSheet();
    } catch (e) { save.disabled = false; $("#t-err").textContent = ruError(e); }
  };
  const done = $("#t-done");
  if (done) done.onclick = async () => { try { await store.tasks.update(t.id, { done: !t.done }); await loadTable("tasks"); toast(t.done ? "Вернули в работу" : "Готово!"); closeSheet(); } catch (e) { toast(ruError(e), true); } };
  const del = $("#t-del");
  if (del) del.onclick = async () => {
    if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Точно удалить? Нажми ещё раз"; return; }
    try { await store.tasks.remove(t.id); await loadTable("tasks"); toast("Задача удалена"); closeSheet(); } catch (e) { toast(ruError(e), true); }
  };
}

function openNewMeeting() {
  openSheet("new-meeting", "Новая встреча", "", `<div class="group">${fld("n-date", "Дата", "", "date")}
    <label class="f" for="n-format">Формат<select id="n-format">${opt(FORMATS, "", "Выбрать формат")}</select></label>
    <label class="f" for="n-coord">Координатор<select id="n-coord">${opt(approved().map(p => [p.id, p.name]), "", "Позже")}</select></label>
    <button class="btn" id="n-save">Добавить встречу</button><p class="err" id="n-err"></p></div>`);
  $("#n-save").onclick = async () => {
    const d = $("#n-date").value; if (!d) { $("#n-err").textContent = "Выбери дату."; return; }
    if (S.meetings.some(m => m.date === d)) { $("#n-err").textContent = "На эту дату встреча уже есть."; return; }
    try {
      const row = await store.meetings.insert({ date: d, format: $("#n-format").value, coord_id: $("#n-coord").value || null, status: "Идея" });
      await loadTable("meetings"); UI.month = monthKey(d); UI.meetF = "all"; toast("Встреча добавлена"); closeSheet();
      if (row?.id) setTimeout(() => openMeeting(row.id), 50);
    } catch (e) { $("#n-err").textContent = ruError(e); }
  };
}

function openNewIdea() {
  openSheet("idea", "Новая идея формата", "", `<div class="group">
    ${fld("i-title", "Название", "")}${ta("i-desc", "Как это может проходить", "")}${fld("i-by", "Кто предложил", S.me?.name || "")}
    <button class="btn" id="i-save">Сохранить идею</button><p class="err" id="i-err"></p></div>`);
  $("#i-save").onclick = async () => {
    const title = $("#i-title").value.trim(); if (!title) { $("#i-err").textContent = "Добавь название идеи."; return; }
    try { await store.ideas.insert({ title, descr: $("#i-desc").value.trim(), by_name: $("#i-by").value.trim(), status: "Идея", author: S.meId }); await loadTable("ideas"); toast("Идея сохранена"); closeSheet(); }
    catch (e) { $("#i-err").textContent = ruError(e); }
  };
}

function openWorship() {
  const list = S.meetings.filter(m => pd(m.date) >= today() && active(m)).slice(0, 6);
  const txt = "Катарина, привет! Темы молодёжных встреч на ближайшее время:\n\n" + list.map(m => `${fmtD(m.date, { weekday: "short", day: "2-digit", month: "2-digit" })} — ${m.theme || "тема уточняется"}${m.format ? ` (${FMT_SHORT[m.format] || m.format})` : ""}${m.passage ? `, ${m.passage}` : ""}`).join("\n") + "\n\nДай знать, если что-то не стыкуется с прославлением 🙏";
  openSheet("worship", "Темы для прославления", "", `<div class="group"><p class="muted">Готовое сообщение с темами ближайших встреч. Скопируй и отправь Катарине.</p>
    <textarea class="copybox" id="w-text" aria-label="Текст сообщения">${esc(txt)}</textarea>
    <button class="btn lime" id="w-copy">Скопировать текст</button></div>`);
  $("#w-copy").onclick = async () => { const t = $("#w-text").value; try { await navigator.clipboard.writeText(t); toast("Скопировано"); } catch (e) { $("#w-text").select(); toast("Выдели текст и скопируй вручную"); } };
}

function openProfile() {
  const me = S.me; let depts = [...(me.depts || [])];
  openSheet("profile", "Мой профиль", ROLES[me.role] + (store.demo ? " · демо" : ""), `
    <div class="group">${fld("pr-name", "Имя", me.name)}
      <span class="eyebrow" style="color:var(--blue)">Мои отделы</span>
      <div class="pick plain" id="pickDepts">${DEPTS.map(d => `<button type="button" data-dept="${esc(d)}" aria-pressed="${depts.includes(d)}">${esc(d)}</button>`).join("")}</div>
      <button class="btn" id="pr-save">Сохранить</button><p class="err" id="pr-err"></p></div>
    <div class="group"><span class="eyebrow">Что я могу</span><p class="muted">${me.role === "admin" ? "Всё: план сред, задачи, подтверждение новых людей и роли." : me.role === "leader" ? "Менять план сред и любые задачи." : "Смотреть план, ставить задачи, отмечать свои задачи, менять встречи, где я координатор."}</p></div>
    <div class="group"><span class="eyebrow">Установить на телефон</span>
      <p class="muted"><b>iPhone:</b> открой сайт в Safari → кнопка «Поделиться» → «На экран Домой».<br><b>Android:</b> открой в Chrome → меню ⋮ → «Установить приложение» или «Добавить на главный экран».</p></div>
    <button class="btn dark" id="pr-out">Выйти из аккаунта</button>`);
  $("#sheetBody").onclick = e => {
    const b = e.target.closest("[data-dept]"); if (!b) return;
    const d = b.dataset.dept; depts = depts.includes(d) ? depts.filter(x => x !== d) : [...depts, d]; b.setAttribute("aria-pressed", depts.includes(d));
  };
  $("#pr-save").onclick = async () => {
    const name = $("#pr-name").value.trim(); if (!name) { $("#pr-err").textContent = "Имя не может быть пустым."; return; }
    try { await store.profiles.update(me.id, { name, depts }); await loadTable("profiles"); toast("Профиль сохранён"); closeSheet(); } catch (e) { $("#pr-err").textContent = ruError(e); }
  };
  $("#pr-out").onclick = async () => { await store.signOut(); UI.sheet = null; $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); S.meId = null; S.me = null; renderAuth(); };
}

function toast(t, bad) { const el = $("#toast"); el.textContent = t; el.classList.toggle("bad", !!bad); el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 2400); }

/* =====================================================================
   EVENTS
   ===================================================================== */
document.addEventListener("click", async e => {
  const t = e.target;
  // auth
  const mode = t.closest("[data-mode]"); if (mode) { const em = $("#a-email"); if (em) renderAuth.email = em.value; renderAuth(mode.dataset.mode); return; }
  if (t.closest("#a-go")) return authGo();
  const demo = t.closest("[data-demo]"); if (demo) { await store.signInAs(demo.dataset.demo); return start(); }
  if (t.closest("#demoReset")) { await store.resetDemo(); seen = new Set(); return renderAuth(); }
  if (t.closest("#p-check")) return start();
  if (t.closest("#p-out")) { await store.signOut(); return renderAuth(); }
  // app
  const o = t.closest("[data-open]"); if (o) { if (UI.flush) { await UI.flush(); UI.flush = null; } return openMeeting(o.dataset.open, o.dataset.pane); }
  const tk = t.closest("[data-task]"); if (tk) { if (UI.flush) { await UI.flush(); UI.flush = null; } return openTask(tk.dataset.task); }
  const nt = t.closest("[data-newtask-for]"); if (nt) { if (UI.flush) { await UI.flush(); UI.flush = null; } return openTask(null, nt.dataset.newtaskFor); }
  const mo = t.closest("[data-month]"); if (mo) { UI.month = mo.dataset.month; return renderPlan(); }
  const mf = t.closest("[data-meetf]"); if (mf) { UI.meetF = mf.dataset.meetf; return renderPlan(); }
  const tf = t.closest("[data-tf]"); if (tf) { UI.taskF = tf.dataset.tf; return renderTasks(); }
  const go = t.closest("[data-goto]"); if (go) { UI.taskF = "mine"; renderTasks(); return setView(go.dataset.goto); }
  const tg = t.closest("[data-toggle]");
  if (tg && !tg.disabled) {
    const task = S.tasks.find(x => x.id === tg.dataset.toggle); if (!task) return;
    task.done = !task.done; renderTasks(); renderBadges(); renderPlanSide();
    try { await store.tasks.update(task.id, { done: task.done }); } catch (err) { task.done = !task.done; renderTasks(); toast(ruError(err), true); }
    return;
  }
  const ap = t.closest("[data-approve]"); if (ap) { try { await store.profiles.update(ap.dataset.approve, { approved: true }); await loadTable("profiles"); toast("Доступ открыт"); renderApp(); } catch (err) { toast(ruError(err), true); } return; }
  const rj = t.closest("[data-reject]");
  if (rj) {
    if (!rj.classList.contains("armed")) { rj.classList.add("armed"); rj.textContent = "Точно?"; return; }
    try { await store.profiles.remove(rj.dataset.reject); await loadTable("profiles"); toast("Удалён"); renderApp(); } catch (err) { toast(ruError(err), true); } return;
  }
  const idel = t.closest("[data-idea-del]"); if (idel) { try { await store.ideas.remove(idel.dataset.ideaDel); await loadTable("ideas"); renderIdeas(); } catch (err) { toast(ruError(err), true); } return; }
  if (t.closest("#al-add")) {
    const { rows, bad } = parseAllowed($("#al-text").value, $("#al-role").value);
    if (!rows.length) { $("#al-err").textContent = "Не нашла ни одной почты. Пример строки: Аня — anya@gmail.com"; return; }
    try { await store.allowed.add(rows); allowedRows = null; toast(`Добавлено: ${rows.length}` + (bad.length ? `, без почты: ${bad.length}` : "")); renderAllowed(); }
    catch (err) { $("#al-err").textContent = ruError(err); }
    return;
  }
  const ald = t.closest("[data-al-del]"); if (ald) { try { await store.allowed.remove(ald.dataset.alDel); allowedRows = null; renderAllowed(); } catch (err) { toast(ruError(err), true); } return; }
  if (t.closest("#tipOff")) { lsSet("sredy-tip-off", true); return renderPlan(); }
  const tab = t.closest(".tab"); if (tab) return setView(tab.dataset.v);
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.id === "deptFilter") { UI.dept = t.value; return renderTasks(); }
  if (t.dataset.role) { try { await store.profiles.update(t.dataset.role, { role: t.value }); await loadTable("profiles"); toast("Роль изменена"); renderApp(); } catch (err) { toast(ruError(err), true); } }
  if (t.dataset.ideaSt) { try { await store.ideas.update(t.dataset.ideaSt, { status: t.value }); await loadTable("ideas"); } catch (err) { toast(ruError(err), true); } }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#sheet").classList.contains("on")) closeSheet();
  if (e.key === "Enter" && !$("#auth").hidden && e.target.tagName === "INPUT") authGo();
});
$("#fab").onclick = () => ({ plan: openNewMeeting, tasks: () => openTask(null), ideas: openNewIdea }[UI.view] || (() => {}))();
$("#sheetClose").onclick = closeSheet; $("#scrim").onclick = closeSheet;
$("#worshipBtn").onclick = openWorship;
$("#meBtn").onclick = openProfile;

async function authGo() {
  const card = document.querySelector(".auth-card[data-cur]"); if (!card) return;
  const cur = card.dataset.cur, err = $("#a-err"), btn = $("#a-go");
  const email = ($("#a-email")?.value || "").trim(); renderAuth.email = email;
  err.textContent = ""; btn.disabled = true;
  try {
    if (cur !== "code" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("В поле «Почта» нужен адрес, например name@gmail.com");
    if (cur === "in") { if (!email || !$("#a-pass").value) throw new Error("Введи почту и пароль."); await store.signIn(email, $("#a-pass").value); return start(); }
    if (cur === "up") {
      const name = $("#a-name").value.trim(); if (!name) throw new Error("Напиши своё имя, чтобы команда тебя узнала.");
      const r = await store.signUp(name, email, $("#a-pass").value);
      if (r.needsConfirm) return renderAuth("in", "Мы отправили письмо для подтверждения. Открой его, потом войди.");
      return start();
    }
    if (cur === "reset") { if (!email) throw new Error("Введи почту."); await store.resetSend(email); return renderAuth("code"); }
    if (cur === "code") { await store.resetConfirm(email, $("#a-code").value.trim(), $("#a-pass").value); return start(); }
  } catch (e) { err.textContent = ruError(e); btn.disabled = false; }
}

/* =====================================================================
   START
   ===================================================================== */
let subscribed = false, reloadTimer = null;
async function start() {
  show("loading");
  S.meId = await store.userId();
  if (!S.meId) return renderAuth();
  await loadTable("profiles");
  if (!S.me) { // профиль ещё не появился (редкий случай)
    await new Promise(r => setTimeout(r, 800)); await loadTable("profiles");
    if (!S.me) { await store.signOut(); return renderAuth("in", "Не нашли профиль. Попробуй войти ещё раз."); }
  }
  if (!S.me.approved) return renderPending();
  await loadAll();
  seen = new Set(lsGet("sredy-seen-" + S.meId, []));
  show("app"); renderApp(); setView(UI.view);
  if (!subscribed) {
    subscribed = true;
    store.subscribe(table => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        await loadTable(table);
        if (!S.me) return;
        if (!S.me.approved) return renderPending();
        renderApp();
      }, 250);
    });
  }
}
store.onAuth(() => { S.meId = null; S.me = null; renderAuth(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me?.approved) loadAll().then(renderApp); });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
}
start().catch(e => { show("auth"); $("#auth").innerHTML = `${logoHtml()}<div class="auth-card"><p class="err">${esc(ruError(e))}</p><button class="btn" onclick="location.reload()">Обновить</button></div>`; });
})();
