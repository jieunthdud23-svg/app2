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
  document.body.classList.add("app-open");
  goPage("dashboard");
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
  unsubscribe?.();
  unsubscribe = null;
  currentUser = null;
  $("#auth-screen").hidden = false;
  $("#app-shell").hidden = true;
  document.body.classList.remove("app-open");
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove("show"), 2600);
