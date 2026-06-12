import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.14.0";
const configured = !Object.values(firebaseConfig).some(value => String(value).includes("YOUR_"));
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const dateKey = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const formatDate = value => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(value));
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const demoKey = "yaksok-demo-v1";

let authMode = "login";
let currentUser = null;
let firebase = null;
let state = { profile: {}, medicines: {}, doseLogs: {}, healthLogs: {} };
let unsubscribe = null;

const demoSeed = {
  profile: { name: "약속 사용자", email: "demo@yaksok.app", condition: "고혈압" },
  medicines: {
    demo1: { name: "혈압약", purpose: "혈압 관리", start: dateKey(), end: "", times: ["08:00", "20:00"], dose: "1정", meal: "식후" },
    demo2: { name: "비타민 D", purpose: "영양 보충", start: dateKey(), end: "", times: ["09:00"], dose: "1정", meal: "식후" }
  },
  doseLogs: {},
  healthLogs: {}
};

async function initFirebase() {
  if (!configured) return;
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`)
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  firebase = { authSdk, dbSdk, auth: authSdk.getAuth(app), db: dbSdk.getDatabase(app) };
  authSdk.onAuthStateChanged(firebase.auth, user => {
    if (user) enterApp(user);
    else showAuth();
  });
}

function getDemo() {
  try { return JSON.parse(localStorage.getItem(demoKey)) || structuredClone(demoSeed); }
  catch { return structuredClone(demoSeed); }
}

async function saveState(path, value) {
  if (currentUser?.demo) {
    const parts = path.split("/");
    let target = state;
    parts.slice(0, -1).forEach(key => target = target[key] ||= {});
    if (value === null) delete target[parts.at(-1)];
    else target[parts.at(-1)] = value;
    localStorage.setItem(demoKey, JSON.stringify(state));
    renderAll();
    return;
  }
  await firebase.dbSdk.set(firebase.dbSdk.ref(firebase.db, `users/${currentUser.uid}/${path}`), value);
}

async function enterApp(user) {
  currentUser = user;
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#storage-mode").textContent = user.demo ? "기기 내 데모 저장" : "Firebase 동기화";
  if (user.demo) {
    state = getDemo();
    renderAll();
  } else {
    unsubscribe?.();
    const userRef = firebase.dbSdk.ref(firebase.db, `users/${user.uid}`);
    unsubscribe = firebase.dbSdk.onValue(userRef, snapshot => {
      state = snapshot.val() || { profile: { name: user.displayName || "사용자", email: user.email }, medicines: {}, doseLogs: {}, healthLogs: {} };
      renderAll();
    });
  }
  setupDoseTimers();
}

function showAuth() {
  currentUser = null;
  $("#auth-screen").hidden = false;
  $("#app-shell").hidden = true;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function dosesForToday() {
  const today = dateKey();
  return Object.entries(state.medicines || {}).flatMap(([medicineId, medicine]) => {
    if (medicine.start && medicine.start > today) return [];
    if (medicine.end && medicine.end < today) return [];
    return (medicine.times || []).map(time => {
      const logId = `${today}_${medicineId}_${time.replace(":", "")}`;
      return { ...medicine, medicineId, time, logId, log: state.doseLogs?.[logId] };
    });
  }).sort((a, b) => a.time.localeCompare(b.time));
}

function renderAll() {
  const profile = state.profile || {};
  const name = profile.name || currentUser?.displayName || "사용자";
  $("#sidebar-name").textContent = name;
  $("#avatar").textContent = name.slice(0, 1);
  $("#today-label").textContent = formatDate(new Date());
  renderDashboard();
  renderMedicines();
  renderHistory();
  renderHealth();
  fillProfile();
}

function renderDashboard() {
  const doses = dosesForToday();
  const done = doses.filter(dose => dose.log?.status === "done").length;
  const rate = doses.length ? Math.round(done / doses.length * 100) : 0;
  $("#done-count").textContent = done;
  $("#total-count").textContent = doses.length;
  $("#success-rate").textContent = `${rate}%`;
  $("#progress-ring").style.background = `conic-gradient(var(--brand) ${rate}%, rgba(255,255,255,.75) ${rate}%)`;
  const next = doses.find(dose => !dose.log && dose.time >= new Date().toTimeString().slice(0, 5)) || doses.find(dose => !dose.log);
  $("#next-dose-text").textContent = next ? `다음 복용은 ${next.time} ${next.name}입니다.` : doses.length ? "오늘 복용 일정을 모두 확인했습니다." : "복용 일정을 등록해 주세요.";
  $("#today-doses").innerHTML = doses.length ? doses.map(dose => `
    <div class="dose-item ${dose.log?.status === "done" ? "completed" : ""}">
      <div class="dose-time">${dose.time}</div>
      <div class="dose-info"><strong>${escapeHtml(dose.name)}</strong><small>${escapeHtml(dose.dose || "용량 미입력")} · ${escapeHtml(dose.meal || "복용법 미입력")}</small></div>
      <div class="dose-actions">
        ${dose.log ? `<span class="status ${dose.log.status}">${dose.log.status === "done" ? "복용 완료" : "건너뜀"}</span>` : `<button class="done-button" data-dose="${dose.logId}" data-status="done">복용 완료</button><button class="skip-button" data-dose="${dose.logId}" data-status="skipped">건너뛰기</button>`}
      </div>
    </div>`).join("") : "등록된 복용 일정이 없습니다.";
  const latestPressure = latestHealth(item => item.systolic && item.diastolic);
  const latestGlucose = latestHealth(item => item.fasting || item.after);
  $("#today-pressure").textContent = latestPressure ? `${latestPressure.systolic}/${latestPressure.diastolic} mmHg` : "기록 없음";
  $("#today-glucose").textContent = latestGlucose ? `${latestGlucose.after || latestGlucose.fasting} mg/dL` : "기록 없음";
  $("#health-tip").textContent = healthMessage(latestPressure, latestGlucose);
  $$("[data-dose]").forEach(button => button.onclick = () => logDose(button.dataset.dose, button.dataset.status));
}

async function logDose(logId, status) {
  const doses = dosesForToday();
  const dose = doses.find(item => item.logId === logId);
  await saveState(`doseLogs/${logId}`, { status, name: dose?.name || "약", time: dose?.time, date: dateKey(), createdAt: Date.now() });
  toast(status === "done" ? "복용 완료로 기록했습니다." : "건너뛰기로 기록했습니다.");
  if (status === "skipped") {
    const skipped = Object.values(state.doseLogs || {}).filter(log => log.status === "skipped").length;
    if (skipped >= 3) toast("최근 건너뛴 약이 있습니다. 복용 일정을 확인해 주세요.");
  }
}

function renderMedicines() {
  const entries = Object.entries(state.medicines || {});
  $("#medicine-grid").innerHTML = entries.length ? entries.map(([id, medicine]) => `
    <article class="medicine-card">
      <h3>${escapeHtml(medicine.name)}</h3><p>${escapeHtml(medicine.purpose || "복용 목적 미입력")}</p>
      <div class="medicine-meta"><span>시간&nbsp; <strong>${(medicine.times || []).join(", ")}</strong></span><span>용량&nbsp; <strong>${escapeHtml(medicine.dose || "-")}</strong></span><span>방법&nbsp; <strong>${escapeHtml(medicine.meal || "-")}</strong></span></div>
      <div class="medicine-actions"><button data-edit-medicine="${id}">수정</button><button class="delete" data-delete-medicine="${id}">삭제</button></div>
    </article>`).join("") : `<div class="card empty-state">등록된 약이 없습니다. 첫 복용약을 등록해 보세요.</div>`;
  $$("[data-edit-medicine]").forEach(button => button.onclick = () => openMedicine(button.dataset.editMedicine));
  $$("[data-delete-medicine]").forEach(button => button.onclick = async () => {
    if (confirm("이 약을 삭제할까요?")) await saveState(`medicines/${button.dataset.deleteMedicine}`, null);
  });
}

function renderHistory() {
  const logs = Object.values(state.doseLogs || {}).sort((a, b) => b.createdAt - a.createdAt);
  const done = logs.filter(log => log.status === "done").length;
  const skipped = logs.filter(log => log.status === "skipped").length;
  $("#history-rate").textContent = logs.length ? `${Math.round(done / logs.length * 100)}%` : "0%";
  $("#history-done").textContent = `${done}회`;
  $("#history-skipped").textContent = `${skipped}회`;
  $("#history-list").innerHTML = logs.length ? logs.map(log => `
    <div class="history-row"><span>${log.date}</span><div><strong>${escapeHtml(log.name)}</strong><small> ${log.time || ""}</small></div><span class="status ${log.status}">${log.status === "done" ? "복용 완료" : "건너뜀"}</span></div>`).join("") : "아직 복용 기록이 없습니다.";
}

function latestHealth(predicate) {
  return Object.values(state.healthLogs || {}).filter(predicate).sort((a, b) => b.timestamp - a.timestamp)[0];
}

function healthMessage(pressure, glucose) {
  if (pressure && (Number(pressure.systolic) >= 140 || Number(pressure.diastolic) >= 90)) return "혈압이 높은 편입니다. 반복되면 의료진과 상담하세요.";
  const sugar = Number(glucose?.after || glucose?.fasting || 0);
  if (sugar >= 200) return "혈당 수치가 높습니다. 상태를 살피고 의료진과 상담하세요.";
  return "약은 충분한 물과 함께 정해진 방법으로 복용하세요.";
}

function renderHealth() {
  const logs = Object.values(state.healthLogs || {}).sort((a, b) => b.timestamp - a.timestamp);
  $("#health-list").innerHTML = logs.length ? logs.map(log => {
    const values = [log.systolic && `혈압 ${log.systolic}/${log.diastolic}`, log.fasting && `공복 ${log.fasting}`, log.after && `식후 ${log.after}`].filter(Boolean).join(" · ");
    return `<div class="history-row"><span>${new Date(log.timestamp).toLocaleDateString("ko-KR")}</span><strong>${values}</strong><small>${new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  }).join("") : "아직 건강 기록이 없습니다.";
  drawChart($("#pressure-chart"), logs.filter(log => log.systolic).slice(0, 7).reverse(), [
    { key: "systolic", color: "#2f7564" }, { key: "diastolic", color: "#a8c9bf" }
  ], 50, 180);
  drawChart($("#glucose-chart"), logs.filter(log => log.fasting || log.after).slice(0, 7).reverse().map(log => ({ ...log, glucose: log.after || log.fasting })), [{ key: "glucose", color: "#687fc1" }], 40, 250);
}

function drawChart(canvas, data, series, min, max) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 400, height = 220;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#edf0ee"; ctx.lineWidth = 1;
  [35, 85, 135, 185].forEach(y => { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(width - 10, y); ctx.stroke(); });
  if (!data.length) { ctx.fillStyle = "#89958f"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("기록을 입력하면 그래프가 표시됩니다.", width / 2, 115); return; }
  series.forEach(item => {
    ctx.strokeStyle = item.color; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
    data.forEach((row, index) => {
      const x = 30 + index * ((width - 50) / Math.max(data.length - 1, 1));
      const y = 190 - ((Number(row[item.key]) - min) / (max - min)) * 155;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      ctx.fillStyle = item.color; ctx.fillRect(x - 3, y - 3, 6, 6);
    });
    ctx.stroke();
  });
}

function fillProfile() {
  const profile = state.profile || {};
  $("#profile-name").value = profile.name || currentUser?.displayName || "";
  $("#profile-email").value = profile.email || currentUser?.email || "";
  $("#profile-birth").value = profile.birth || "";
  $("#profile-gender").value = profile.gender || "";
  $("#profile-guardian").value = profile.guardian || "";
  $("#profile-condition").value = profile.condition || "";
}

function openMedicine(id = "") {
  const medicine = state.medicines?.[id] || {};
  $("#medicine-modal-title").textContent = id ? "복용약 수정" : "새 약 등록";
  $("#medicine-id").value = id;
  $("#medicine-name").value = medicine.name || "";
  $("#medicine-purpose").value = medicine.purpose || "";
  $("#medicine-start").value = medicine.start || dateKey();
  $("#medicine-end").value = medicine.end || "";
  $("#medicine-times").value = (medicine.times || []).join(", ");
  $("#medicine-dose").value = medicine.dose || "";
  $("#medicine-meal").value = medicine.meal || "식후";
  $("#medicine-modal").showModal();
}

function setupDoseTimers() {
  clearInterval(window.doseTimer);
  const check = () => {
    const now = new Date().toTimeString().slice(0, 5);
    dosesForToday().filter(dose => !dose.log && dose.time === now).forEach(dose => {
      const key = `notified-${dose.logId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("약속 복약 알림", { body: `${dose.name} 복용 시간입니다.` });
      }
      toast(`${dose.time}, ${dose.name} 복용 시간입니다.`);
    });
  };
  check(); window.doseTimer = setInterval(check, 30000);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

$$(".auth-tab").forEach(button => button.onclick = () => {
  authMode = button.dataset.authMode;
  $$(".auth-tab").forEach(item => item.classList.toggle("active", item === button));
  $("#signup-fields").hidden = authMode !== "signup";
  $("#auth-submit").textContent = authMode === "signup" ? "회원가입" : "로그인";
});

$("#auth-form").onsubmit = async event => {
  event.preventDefault();
  if (!configured) return toast("먼저 firebase-config.js에 Firebase 설정값을 입력하거나 데모를 이용하세요.");
  try {
    const email = $("#auth-email").value, password = $("#auth-password").value;
    if (authMode === "signup") {
      const result = await firebase.authSdk.createUserWithEmailAndPassword(firebase.auth, email, password);
      const profile = { name: $("#auth-name").value || "사용자", email, birth: $("#auth-birth").value, gender: $("#auth-gender").value, guardian: $("#auth-guardian").value, condition: $("#auth-condition").value };
      await firebase.authSdk.updateProfile(result.user, { displayName: profile.name });
      await firebase.dbSdk.set(firebase.dbSdk.ref(firebase.db, `users/${result.user.uid}/profile`), profile);
    } else await firebase.authSdk.signInWithEmailAndPassword(firebase.auth, email, password);
  } catch (error) { toast(authError(error.code)); }
};

$("#google-login").onclick = async () => {
  if (!configured) return toast("Firebase 설정 후 Google 로그인을 사용할 수 있습니다.");
  try { await firebase.authSdk.signInWithPopup(firebase.auth, new firebase.authSdk.GoogleAuthProvider()); }
  catch (error) { toast(authError(error.code)); }
};
$("#demo-login").onclick = () => enterApp({ uid: "demo", email: "demo@yaksok.app", displayName: "약속 사용자", demo: true });
$("#logout").onclick = () => currentUser?.demo ? showAuth() : firebase.authSdk.signOut(firebase.auth);
$("#notification-button").onclick = async () => {
  if (!("Notification" in window)) return toast("이 브라우저는 알림을 지원하지 않습니다.");
  const result = await Notification.requestPermission();
  toast(result === "granted" ? "복약 알림을 허용했습니다." : "알림 권한이 허용되지 않았습니다.");
};

function authError(code = "") {
  if (code.includes("invalid-credential")) return "이메일 또는 비밀번호를 확인해 주세요.";
  if (code.includes("email-already")) return "이미 가입된 이메일입니다.";
  if (code.includes("weak-password")) return "비밀번호는 6자 이상 입력해 주세요.";
  if (code.includes("popup")) return "로그인 창이 닫혔거나 차단되었습니다.";
  return "처리 중 오류가 발생했습니다. Firebase 설정을 확인해 주세요.";
}

function goPage(page) {
  $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
  $$("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const titles = { dashboard: "오늘도 건강한 하루 보내세요", medicines: "복용약을 관리해요", history: "복용 기록을 확인해요", health: "건강 변화를 기록해요", profile: "내 정보를 관리해요" };
  $("#page-title").textContent = titles[page];
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-page]").forEach(button => button.onclick = () => goPage(button.dataset.page));
$$("[data-page-link]").forEach(button => button.onclick = () => goPage(button.dataset.pageLink));
$$("[data-open-modal='medicine']").forEach(button => button.onclick = () => openMedicine());
$$("[data-open-modal='health']").forEach(button => button.onclick = () => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $("#health-time").value = now; $("#health-modal").showModal();
});
$$(".close-modal").forEach(button => button.onclick = () => button.closest("dialog").close());

$("#medicine-form").onsubmit = async event => {
  event.preventDefault();
  const id = $("#medicine-id").value || uid();
  const times = $("#medicine-times").value.split(",").map(time => time.trim()).filter(time => /^\d{2}:\d{2}$/.test(time));
  if (!times.length) return toast("복용 시간을 08:00 형식으로 입력해 주세요.");
  await saveState(`medicines/${id}`, { name: $("#medicine-name").value.trim(), purpose: $("#medicine-purpose").value.trim(), start: $("#medicine-start").value, end: $("#medicine-end").value, times, dose: $("#medicine-dose").value.trim(), meal: $("#medicine-meal").value });
  $("#medicine-modal").close(); toast("복용약을 저장했습니다."); setupDoseTimers();
};

$("#health-form").onsubmit = async event => {
  event.preventDefault();
  const systolic = $("#health-systolic").value, diastolic = $("#health-diastolic").value, fasting = $("#health-fasting").value, after = $("#health-after").value;
  if (!(systolic && diastolic) && !fasting && !after) return toast("혈압 또는 혈당 수치를 입력해 주세요.");
  const timestamp = new Date($("#health-time").value).getTime();
  await saveState(`healthLogs/${uid()}`, { systolic, diastolic, fasting, after, timestamp });
  $("#health-modal").close(); $("#health-form").reset(); toast("건강 기록을 저장했습니다.");
};

$("#profile-form").onsubmit = async event => {
  event.preventDefault();
  await saveState("profile", { name: $("#profile-name").value.trim(), email: $("#profile-email").value, birth: $("#profile-birth").value, gender: $("#profile-gender").value, guardian: $("#profile-guardian").value.trim(), condition: $("#profile-condition").value.trim() });
  toast("내 정보를 저장했습니다.");
};

window.addEventListener("resize", () => currentUser && renderHealth());
initFirebase().catch(() => toast("Firebase 연결에 실패했습니다. 설정값을 확인해 주세요."));
