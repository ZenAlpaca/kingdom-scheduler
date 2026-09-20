import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";

/* ============================================================================
   KINGDOM SCHEDULER
   Nightclub staff scheduling — single-file React app.

   This file assumes a bundler that handles JSX (Next.js / Vite / CRA) and
   expects two sibling serverless functions to exist on the same origin:
     /api/db        — Supabase proxy (see api/db.js)
     /api/telegram  — Telegram sender (see api/telegram.js)
   If those endpoints aren't reachable (e.g. while developing the UI alone),
   the app falls back to an in-memory demo dataset so it still renders and
   behaves correctly — look for DEMO_* below.
============================================================================ */

/* ---------------------------------- THEME --------------------------------- */

const COLORS = {
  bg: "#0a0a0f",
  bgRaised: "#121218",
  bgCard: "#17171f",
  bgCardHover: "#1d1d27",
  border: "#26262f",
  borderLight: "#33333f",
  accent: "#f97316",
  accentDim: "rgba(249,115,22,0.14)",
  accentBorder: "rgba(249,115,22,0.45)",
  text: "#f2f2f5",
  textDim: "#9c9ca8",
  textFaint: "#5f5f6c",
  yellow: "#eab308",
  yellowDim: "rgba(234,179,8,0.14)",
  purple: "#a855f7",
  purpleDim: "rgba(168,85,247,0.14)",
  blue: "#3b82f6",
  blueDim: "rgba(59,130,246,0.14)",
  green: "#22c55e",
  greenDim: "rgba(34,197,94,0.14)",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.14)",
};

const FONT_DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { background: ${COLORS.bg}; margin: 0; padding: 0; }
    body { font-family: ${FONT_BODY}; color: ${COLORS.text}; }
    input, select, textarea, button { font-family: ${FONT_BODY}; }
    input, select, textarea { font-size: 16px; } /* prevents iOS auto-zoom */
    button { cursor: pointer; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: ${COLORS.borderLight}; border-radius: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }

    @keyframes ksn-sheet-up {
      from { transform: translateY(24px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes ksn-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes ksn-toast-in {
      from { transform: translateY(-12px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .ksn-focusable:focus-visible {
      outline: 2px solid ${COLORS.accent};
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
    }
  `}</style>
);

/* -------------------------------- UTILITIES -------------------------------- */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const pad2 = (n) => String(n).padStart(2, "0");

const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseISODate = (s) => new Date(`${s}T00:00:00`);

const addDays = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

const startOfWeek = (d) => {
  // Week starts Monday
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const weekDates = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

const formatShort = (d, lang) =>
  d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { weekday: "short", month: "short", day: "numeric" });

const formatDay = (d, lang) =>
  d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { weekday: "long" });

const formatRange = (start, end, lang) =>
  `${formatShort(start, lang).toUpperCase()} \u2013 ${formatShort(end, lang).toUpperCase()}`;

const timeOverlaps = (aFrom, aUntil, bFrom, bUntil) => {
  if (!aFrom || !aUntil || !bFrom || !bUntil) return false;
  return aFrom < bUntil && bFrom < aUntil;
};

// "14:30" -> "2:30 PM". Leaves "CLOSE" and empty values untouched — those
// are handled by their callers. Times are stored/edited in 24-hour form
// (that's what <input type="time"> needs) but always *displayed* in
// regular 12-hour clock time.
const formatTime12 = (value) => {
  if (!value || value === "CLOSE") return value || "";
  const [hStr, mStr = "00"] = value.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return value;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
};

/* ------------------------------- TRANSLATIONS ------------------------------ */

const translations = {
  en: {
    appName: "Kingdom Scheduler",
    tagline: "Who's on tonight",
    language: "Language",
    enterPin: "Enter your PIN",
    wrongPin: "That PIN doesn't match. Try again.",
    backToProfiles: "Back",
    logOut: "Log out",

    navSchedule: "Schedule",
    navAvailability: "Availability",
    navTimeOff: "Time Off",
    navSwaps: "Swaps",
    navBuilder: "Builder",
    navShowDays: "Show Days",
    navSetup: "Setup",

    myShifts: "My Shifts",
    fullSchedule: "Full Schedule",
    doors: "Doors",
    close: "Close",
    onCall: "ON CALL",
    standby: "Standby — may be called in",
    noShiftsThisWeek: "No shifts scheduled for you this week.",
    noShowDaysWeek: "No show days marked for this week.",
    week: "Week",
    today: "Today",

    availabilityTitle: "Availability",
    availabilitySubtitle: "Let us know when you can work",
    allShowNightsChecked: "All show nights are checked in — tap the \u00d7 to skip a night.",
    available: "Available",
    notAvailable: "Not available",
    allDay: "All day",
    from: "From",
    until: "Until",
    notes: "Notes (optional)",
    submitAvailability: "Submit availability",
    availabilitySubmitted: "Availability submitted",
    noUpcomingShowDays: "No upcoming show days to submit for yet.",

    timeOffTitle: "Time Off",
    requestTimeOff: "Request time off",
    reason: "Reason",
    startDate: "Start date",
    endDate: "End date",
    submitRequest: "Submit request",
    pending: "Pending",
    approved: "Approved",
    denied: "Denied",
    deleteRequest: "Delete",
    approveApprovedWarning: "This request is already approved — delete anyway?",
    approve: "Approve",
    deny: "Deny",
    remove: "Remove",
    noTimeOffRequests: "No time off requests yet.",

    swapsTitle: "Shift Swaps",
    claimable: "Open to claim",
    waitingPickup: "Waiting for pickup",
    mySwaps: "My shifts",
    postForSwap: "Post shift",
    postShiftForSwap: "Post this shift for pickup",
    swapNote: "Note for coworkers (optional)",
    claim: "Claim",
    cancelPost: "Cancel post",
    noClaimable: "Nothing open to claim right now.",
    noWaiting: "Nothing waiting for pickup.",
    noMySwaps: "You haven't posted any shifts.",
    claimedShift: "Shift claimed",

    builderTitle: "Schedule Builder",
    publish: "Publish schedule",
    published: "Schedule published",
    noShowDaysBuilder: "Mark some show days first — the builder needs at least one to build against.",
    conflict: "Outside stated availability",
    timeOffBlock: "Approved time off",
    doorsTime: "Doors time",
    closeTime: "Close time",

    setupTitle: "Setup",
    departments: "Departments",
    addDepartment: "Add department",
    departmentName: "Department name",
    staff: "Staff",
    addStaff: "Add staff",
    alsoWorksIn: "Also works in",
    fullName: "Full name",
    pin: "4-digit PIN",
    phone: "Phone",
    manager: "Manager",
    also: "also",
    confirmRemove: "Remove this person? This can't be undone.",
    csvImportExport: "Import / Export (CSV)",
    importCsv: "Import CSV",
    exportCsv: "Export CSV",
    downloadTemplate: "Download template",
    csvWarning: "Importing overwrites the staff list. Owners and managers already marked as such are kept.",

    showDaysTitle: "Show Days",
    showDaysHelp: "Tap a date to mark or unmark it as a show day.",

    availabilityAdminTitle: "Availability",
    submittedSection: "Submitted",
    notSubmittedSection: "Not submitted",

    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    add: "Add",
    yes: "Yes",
    no: "No",
    optional: "optional",
    selectWeeks: "Select the weeks you're submitting for",
    you: "you",
  },
  es: {
    appName: "Kingdom Scheduler",
    tagline: "Qui\u00e9n trabaja esta noche",
    language: "Idioma",
    enterPin: "Ingresa tu PIN",
    wrongPin: "Ese PIN no coincide. Intenta de nuevo.",
    backToProfiles: "Atr\u00e1s",
    logOut: "Cerrar sesi\u00f3n",

    navSchedule: "Horario",
    navAvailability: "Disponibilidad",
    navTimeOff: "D\u00edas libres",
    navSwaps: "Cambios",
    navBuilder: "Constructor",
    navShowDays: "D\u00edas de show",
    navSetup: "Configuraci\u00f3n",

    myShifts: "Mis turnos",
    fullSchedule: "Horario completo",
    doors: "Puertas",
    close: "Cierre",
    onCall: "DE GUARDIA",
    standby: "En espera \u2014 puede ser llamado",
    noShiftsThisWeek: "No tienes turnos esta semana.",
    noShowDaysWeek: "No hay d\u00edas de show marcados esta semana.",
    week: "Semana",
    today: "Hoy",

    availabilityTitle: "Disponibilidad",
    availabilitySubtitle: "Cu\u00e9ntanos cu\u00e1ndo puedes trabajar",
    allShowNightsChecked: "Todas las noches de show est\u00e1n marcadas \u2014 toca la \u00d7 para omitir una.",
    available: "Disponible",
    notAvailable: "No disponible",
    allDay: "Todo el d\u00eda",
    from: "Desde",
    until: "Hasta",
    notes: "Notas (opcional)",
    submitAvailability: "Enviar disponibilidad",
    availabilitySubmitted: "Disponibilidad enviada",
    noUpcomingShowDays: "A\u00fan no hay d\u00edas de show pr\u00f3ximos para enviar.",

    timeOffTitle: "D\u00edas libres",
    requestTimeOff: "Solicitar d\u00edas libres",
    reason: "Motivo",
    startDate: "Fecha de inicio",
    endDate: "Fecha de fin",
    submitRequest: "Enviar solicitud",
    pending: "Pendiente",
    approved: "Aprobado",
    denied: "Denegado",
    deleteRequest: "Eliminar",
    approveApprovedWarning: "Esta solicitud ya est\u00e1 aprobada \u2014 \u00bfeliminar de todos modos?",
    approve: "Aprobar",
    deny: "Denegar",
    remove: "Quitar",
    noTimeOffRequests: "A\u00fan no hay solicitudes.",

    swapsTitle: "Cambios de turno",
    claimable: "Disponibles para tomar",
    waitingPickup: "Esperando que alguien tome",
    mySwaps: "Mis turnos",
    postForSwap: "Publicar turno",
    postShiftForSwap: "Publicar este turno",
    swapNote: "Nota para compa\u00f1eros (opcional)",
    claim: "Tomar",
    cancelPost: "Cancelar publicaci\u00f3n",
    noClaimable: "No hay turnos disponibles ahora.",
    noWaiting: "Nada esperando que lo tomen.",
    noMySwaps: "No has publicado ning\u00fan turno.",
    claimedShift: "Turno tomado",

    builderTitle: "Constructor de horarios",
    publish: "Publicar horario",
    published: "Horario publicado",
    noShowDaysBuilder: "Marca d\u00edas de show primero \u2014 el constructor necesita al menos uno.",
    conflict: "Fuera de la disponibilidad indicada",
    timeOffBlock: "D\u00edas libres aprobados",
    doorsTime: "Hora de puertas",
    closeTime: "Hora de cierre",

    setupTitle: "Configuraci\u00f3n",
    departments: "Departamentos",
    addDepartment: "Agregar departamento",
    departmentName: "Nombre del departamento",
    staff: "Personal",
    addStaff: "Agregar personal",
    alsoWorksIn: "Tambi\u00e9n trabaja en",
    fullName: "Nombre completo",
    pin: "PIN de 4 d\u00edgitos",
    phone: "Tel\u00e9fono",
    manager: "Gerente",
    also: "tambi\u00e9n",
    confirmRemove: "\u00bfQuitar a esta persona? No se puede deshacer.",
    csvImportExport: "Importar / Exportar (CSV)",
    importCsv: "Importar CSV",
    exportCsv: "Exportar CSV",
    downloadTemplate: "Descargar plantilla",
    csvWarning: "Importar sobrescribe la lista de personal. Los due\u00f1os y gerentes ya marcados se conservan.",

    showDaysTitle: "D\u00edas de show",
    showDaysHelp: "Toca una fecha para marcarla o desmarcarla como d\u00eda de show.",

    availabilityAdminTitle: "Disponibilidad",
    submittedSection: "Enviado",
    notSubmittedSection: "No enviado",

    save: "Guardar",
    cancel: "Cancelar",
    edit: "Editar",
    delete: "Eliminar",
    add: "Agregar",
    yes: "S\u00ed",
    no: "No",
    optional: "opcional",
    selectWeeks: "Selecciona las semanas para las que env\u00edas",
    you: "t\u00fa",
  },
};

const LanguageContext = createContext(null);
const useLang = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
};
const useT = () => {
  const { lang } = useLang();
  return useCallback((key) => translations[lang][key] ?? key, [lang]);
};

/* --------------------------------- DEPT CTX -------------------------------- */

const DeptContext = createContext(null);
const useDepts = () => {
  const ctx = useContext(DeptContext);
  if (!ctx) throw new Error("useDepts must be used within DeptProvider");
  return ctx;
};

/* ------------------------------ BACKEND HELPERS ----------------------------- */

let DEMO_MODE = false; // flips true the first time a /api/db call fails

async function dbSelect(table) {
  try {
    const res = await fetch(`/api/db?table=${encodeURIComponent(table)}`);
    if (!res.ok) throw new Error(`db select ${table} failed`);
    const { data } = await res.json();
    return data;
  } catch (e) {
    DEMO_MODE = true;
    return null; // caller falls back to demo seed
  }
}

async function dbWrite(operation, table, payload) {
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-operation": operation },
      body: JSON.stringify({ table, ...payload }),
    });
    if (!res.ok) throw new Error(`db ${operation} ${table} failed`);
    return await res.json();
  } catch (e) {
    DEMO_MODE = true;
    return null;
  }
}

async function sendTelegram(message) {
  try {
    await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    // Non-fatal — Telegram is best-effort.
    console.warn("Telegram send failed", e);
  }
}

/* --------------------------------- DEMO SEED -------------------------------- */
// Used only when /api/db isn't reachable, so the UI is fully explorable
// while you wire up Supabase.

const DEMO_DEPARTMENTS = [
  { id: "dept-box", name: "Box Office", color: COLORS.purple },
  { id: "dept-sec", name: "Security", color: COLORS.blue },
  { id: "dept-light", name: "Lighting Director", color: COLORS.yellow },
  { id: "dept-bar", name: "Bartender", color: COLORS.accent },
  { id: "dept-back", name: "Barback", color: COLORS.green },
];

const DEMO_USERS = [
  { id: "u-owner", name: "Dom Reyes", pin: "1234", phone: "", depts: [], isManager: true, isOwner: true },
  { id: "u-mgr", name: "Priya Nair", pin: "1111", phone: "", depts: ["dept-sec"], isManager: true, isOwner: false },
  { id: "u-1", name: "Marcus Cole", pin: "2222", phone: "555-0101", depts: ["dept-bar"], isManager: false, isOwner: false },
  { id: "u-2", name: "Jade Kim", pin: "3333", phone: "555-0102", depts: ["dept-bar", "dept-back"], isManager: false, isOwner: false },
  { id: "u-3", name: "Tariq Osei", pin: "4444", phone: "555-0103", depts: ["dept-sec"], isManager: false, isOwner: false },
  { id: "u-4", name: "Lena Volkov", pin: "5555", phone: "555-0104", depts: ["dept-box"], isManager: false, isOwner: false },
  { id: "u-5", name: "Sam Ortiz", pin: "6666", phone: "555-0105", depts: ["dept-light"], isManager: false, isOwner: false },
];

const nextFriday = (() => {
  const d = new Date();
  const day = d.getDay();
  const add = (5 - day + 7) % 7 || 7;
  return addDays(d, add);
})();
const nextSaturday = addDays(nextFriday, 1);

const DEMO_SHOW_DAYS = [toISODate(nextFriday), toISODate(nextSaturday)];

const DEMO_DOORS_CLOSE = {
  [toISODate(nextFriday)]: { doors: "22:00", close: "CLOSE" },
  [toISODate(nextSaturday)]: { doors: "22:00", close: "CLOSE" },
};

const DEMO_SHIFTS = [
  { id: "s1", date: toISODate(nextFriday), deptId: "dept-bar", userId: "u-1", start: "21:30", end: "CLOSE", onCall: false },
  { id: "s2", date: toISODate(nextFriday), deptId: "dept-sec", userId: "u-3", start: "22:00", end: "CLOSE", onCall: false },
  { id: "s3", date: toISODate(nextSaturday), deptId: "dept-bar", userId: "u-2", start: "21:00", end: "CLOSE", onCall: false },
  { id: "s4", date: toISODate(nextSaturday), deptId: "dept-light", userId: "u-5", start: null, end: null, onCall: true },
];

/* ---------------------------------- ICONS ----------------------------------- */
// Small inline SVGs — no icon library dependency.

const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "sun": return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "swap": return <svg {...p}><path d="M7 4v12M7 4l-3 3M7 4l3 3M17 20V8M17 20l3-3M17 20l-3-3" /></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
    case "check": return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>;
    case "x": return <svg {...p}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "chevronLeft": return <svg {...p}><path d="M15 18l-6-6 6-6" /></svg>;
    case "chevronRight": return <svg {...p}><path d="M9 18l6-6-6-6" /></svg>;
    case "trash": return <svg {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" /></svg>;
    case "edit": return <svg {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>;
    case "phone": return <svg {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .6 2.9a2 2 0 01-.4 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.9.5 2.9.6a2 2 0 011.7 2.1z" /></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
    case "users": return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /></svg>;
    case "upload": return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>;
    case "download": return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
    case "info": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></svg>;
    default: return null;
  }
};

/* -------------------------------- UI PRIMITIVES ------------------------------ */

const Button = ({ children, onClick, variant = "primary", size = "md", disabled, style, type = "button", full }) => {
  const base = {
    fontFamily: FONT_BODY,
    fontWeight: 600,
    borderRadius: 10,
    border: "1px solid transparent",
    transition: "background 120ms, border-color 120ms, opacity 120ms",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    opacity: disabled ? 0.5 : 1,
    width: full ? "100%" : undefined,
  };
  const sizes = { sm: { padding: "7px 12px", fontSize: 13 }, md: { padding: "11px 18px", fontSize: 14.5 }, lg: { padding: "14px 20px", fontSize: 15.5 } };
  const variants = {
    primary: { background: COLORS.accent, color: "#150c04", border: `1px solid ${COLORS.accent}` },
    outline: { background: "transparent", color: COLORS.text, border: `1px solid ${COLORS.borderLight}` },
    ghost: { background: "transparent", color: COLORS.textDim, border: "1px solid transparent" },
    danger: { background: "transparent", color: COLORS.red, border: `1px solid rgba(239,68,68,0.4)` },
  };
  return (
    <button
      type={type}
      className="ksn-focusable"
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
};

const IconButton = ({ name, onClick, color = COLORS.textDim, size = 20, ariaLabel }) => (
  <button
    className="ksn-focusable"
    onClick={onClick}
    aria-label={ariaLabel || name}
    style={{ background: "transparent", border: "none", color, padding: 8, borderRadius: 8, display: "flex" }}
  >
    <Icon name={name} size={size} />
  </button>
);

const Badge = ({ children, color = COLORS.accent, bg }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 9px",
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 700,
      letterSpacing: 0.3,
      color,
      background: bg || `${color}22`,
      border: `1px solid ${color}55`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

const ColorDot = ({ color, size = 12, onClick }) => (
  <span
    onClick={onClick}
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      display: "inline-block",
      cursor: onClick ? "pointer" : "default",
      flexShrink: 0,
      boxShadow: onClick ? `0 0 0 2px ${COLORS.bg}, 0 0 0 3px ${color}55` : "none",
    }}
  />
);

const Card = ({ children, style }) => (
  <div
    style={{
      background: COLORS.bgCard,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 14,
      padding: 16,
      ...style,
    }}
  >
    {children}
  </div>
);

const EmptyState = ({ icon = "calendar", title, subtitle }) => (
  <div style={{ textAlign: "center", padding: "48px 20px", color: COLORS.textFaint }}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.6 }}>
      <Icon name={icon} size={30} />
    </div>
    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, color: COLORS.textDim, marginBottom: 4 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 13.5, maxWidth: 320, margin: "0 auto" }}>{subtitle}</div>}
  </div>
);

const TextInput = ({ label, value, onChange, placeholder, type = "text", required }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: COLORS.textDim }}>
    {label}
    <input
      type={type}
      value={value}
      required={required}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: COLORS.bgRaised,
        border: `1px solid ${COLORS.borderLight}`,
        borderRadius: 10,
        padding: "10px 12px",
        color: COLORS.text,
        outline: "none",
      }}
    />
  </label>
);

/* Sheet modal — slides up from the bottom on mobile, centers on desktop */
const Sheet = ({ open, onClose, title, children, maxWidth = 480 }) => {
  const isMobile = useIsMobile();
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        animation: "ksn-fade 150ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: isMobile ? 0 : 20,
          borderBottomRightRadius: isMobile ? 0 : 20,
          width: "100%",
          maxWidth,
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
          animation: "ksn-sheet-up 200ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{title}</div>
          <IconButton name="x" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
};

/* Toast notifications */
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "default") => {
    const id = uid();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: "fixed", top: 16, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 400, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: COLORS.bgRaised,
              border: `1px solid ${t.tone === "error" ? "rgba(239,68,68,0.5)" : COLORS.accentBorder}`,
              color: COLORS.text,
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 500,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              animation: "ksn-toast-in 180ms ease",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/* Responsive helper */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : true);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

/* Week navigator */
const WeekNav = ({ weekStart, onChange }) => {
  const { lang } = useLang();
  const t = useT();
  const end = addDays(weekStart, 6);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
      <IconButton name="chevronLeft" onClick={() => onChange(addDays(weekStart, -7))} ariaLabel="Previous week" />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>{formatRange(weekStart, end, lang)}</div>
        <button
          onClick={() => onChange(startOfWeek(new Date()))}
          style={{ background: "none", border: "none", color: COLORS.accent, fontSize: 11.5, fontWeight: 600, padding: 0, marginTop: 2 }}
        >
          {t("today")}
        </button>
      </div>
      <IconButton name="chevronRight" onClick={() => onChange(addDays(weekStart, 7))} ariaLabel="Next week" />
    </div>
  );
};

/* ================================================================
   LOGIN
================================================================= */

const LoginScreen = ({ users, onLogin }) => {
  const { lang, setLang } = useLang();
  const t = useT();
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length === 4 && selected) {
      if (pin === selected.pin) {
        onLogin(selected);
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 500);
      }
    }
  }, [pin]);

  const pressDigit = (d) => {
    if (pin.length < 4) setPin((p) => p + d);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "10vh 20px 40px", background: COLORS.bg }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: -0.5 }}>
          Kingdom <span style={{ color: COLORS.accent }}>Scheduler</span>
        </div>
        <div style={{ color: COLORS.textDim, fontSize: 14, marginTop: 6 }}>{t("tagline")}</div>
      </div>

      {!selected && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 28, background: COLORS.bgCard, padding: 4, borderRadius: 999, border: `1px solid ${COLORS.border}` }}>
            {["en", "es"].map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  background: lang === code ? COLORS.accent : "transparent",
                  color: lang === code ? "#150c04" : COLORS.textDim,
                }}
              >
                {code === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 14, width: "100%", maxWidth: 640 }}>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className="ksn-focusable"
                style={{
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 16,
                  padding: "20px 12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${COLORS.accent}, #7c2d12)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: 20,
                    color: "#150c04",
                  }}
                >
                  {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>{u.name}</div>
                {u.isOwner && <Badge color={COLORS.accent}>Owner</Badge>}
                {!u.isOwner && u.isManager && <Badge color={COLORS.blue}>Manager</Badge>}
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <button onClick={() => { setSelected(null); setPin(""); }} style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 13, marginBottom: 20 }}>
            ← {t("backToProfiles")}
          </button>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{selected.name}</div>
          <div style={{ color: COLORS.textDim, fontSize: 13.5, marginBottom: 24 }}>{t("enterPin")}</div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 28 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `2px solid ${error ? COLORS.red : COLORS.accent}`,
                  background: i < pin.length ? (error ? COLORS.red : COLORS.accent) : "transparent",
                  transition: "background 100ms",
                }}
              />
            ))}
          </div>
          {error && <div style={{ color: COLORS.red, fontSize: 12.5, marginBottom: 16, marginTop: -14 }}>{t("wrongPin")}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
              k === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => (k === "del" ? setPin((p) => p.slice(0, -1)) : pressDigit(k))}
                  className="ksn-focusable"
                  style={{
                    background: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 14,
                    padding: "18px 0",
                    fontSize: 18,
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 600,
                    color: COLORS.text,
                  }}
                >
                  {k === "del" ? "⌫" : k}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ================================================================
   EMPLOYEE — SCHEDULE
================================================================= */

const ScheduleView = ({ currentUser, shifts, users, showDays, doorsClose }) => {
  const t = useT();
  const { lang } = useLang();
  const { departments } = useDepts();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [mode, setMode] = useState("mine"); // mine | full

  const weekShowDays = useMemo(() => {
    const dates = weekDates(weekStart).map(toISODate);
    return showDays.filter((d) => dates.includes(d)).sort();
  }, [weekStart, showDays]);

  const shiftsForDay = (date) => shifts.filter((s) => s.date === date);

  const userById = (id) => users.find((u) => u.id === id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      <div style={{ display: "flex", gap: 6, background: COLORS.bgCard, padding: 4, borderRadius: 999, border: `1px solid ${COLORS.border}`, alignSelf: "flex-start" }}>
        {[
          ["mine", t("myShifts")],
          ["full", t("fullSchedule")],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              background: mode === key ? COLORS.accent : "transparent",
              color: mode === key ? "#150c04" : COLORS.textDim,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {weekShowDays.length === 0 && <EmptyState icon="calendar" title={t("noShowDaysWeek")} />}

      {weekShowDays.map((date) => {
        const dayShifts = shiftsForDay(date);
        const mine = dayShifts.filter((s) => s.userId === currentUser.id);
        const dc = doorsClose[date] || {};
        const d = parseISODate(date);

        if (mode === "mine" && mine.length === 0) return null;

        return (
          <Card key={date}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16 }}>{formatShort(d, lang)}</div>
                <div style={{ color: COLORS.textDim, fontSize: 12.5 }}>{formatDay(d, lang)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {dc.doors && <Badge color={COLORS.textDim}>{t("doors")} {formatTime12(dc.doors)}</Badge>}
                {dc.close && <Badge color={COLORS.textDim}>{t("close")} {dc.close === "CLOSE" ? t("close").toUpperCase() : formatTime12(dc.close)}</Badge>}
              </div>
            </div>

            {mode === "mine" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mine.map((s) => (
                  <ShiftRow key={s.id} shift={s} departments={departments} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {departments.map((dept) => {
                  const deptShifts = dayShifts.filter((s) => s.deptId === dept.id);
                  if (deptShifts.length === 0) return null;
                  return (
                    <div key={dept.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid ${dept.color}33` }}>
                        <ColorDot color={dept.color} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: dept.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{dept.name}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {deptShifts.map((s) => (
                          <ShiftRow key={s.id} shift={s} departments={departments} person={userById(s.userId)?.name} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

const ShiftRow = ({ shift, departments, person }) => {
  const t = useT();
  const dept = departments.find((d) => d.id === shift.deptId);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 10,
        background: shift.onCall ? COLORS.yellowDim : COLORS.bgRaised,
        border: `1px solid ${shift.onCall ? "rgba(234,179,8,0.35)" : COLORS.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!person && dept && <ColorDot color={dept.color} />}
        <div>
          {person && <div style={{ fontSize: 13.5, fontWeight: 600 }}>{person}</div>}
          {!person && dept && <div style={{ fontSize: 12, color: COLORS.textDim }}>{dept.name}</div>}
        </div>
      </div>
      {shift.onCall ? (
        <Badge color={COLORS.yellow}>{t("onCall")}</Badge>
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
          {formatTime12(shift.start)} – {shift.end === "CLOSE" ? "CLOSE" : formatTime12(shift.end)}
        </div>
      )}
    </div>
  );
};

/* ================================================================
   EMPLOYEE — AVAILABILITY
================================================================= */

const AvailabilityView = ({ currentUser, showDays, doorsClose, availability, onSubmit }) => {
  const t = useT();
  const { lang } = useLang();

  // Group upcoming show days into weekend "bubbles" (weeks)
  const upcoming = useMemo(
    () => showDays.map(parseISODate).filter((d) => d >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a - b),
    [showDays]
  );

  const weekBubbles = useMemo(() => {
    const map = new Map();
    upcoming.forEach((d) => {
      const ws = toISODate(startOfWeek(d));
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws).push(d);
    });
    return Array.from(map.entries()).map(([ws, dates]) => ({ weekStart: ws, dates }));
  }, [upcoming]);

  const [selectedWeeks, setSelectedWeeks] = useState(() => new Set(weekBubbles.map((w) => w.weekStart)));
  const [entries, setEntries] = useState(() => {
    const initial = {};
    upcoming.forEach((d) => {
      const iso = toISODate(d);
      const existing = availability.find((a) => a.userId === currentUser.id && a.date === iso);
      initial[iso] = existing
        ? { available: existing.available, allDay: existing.allDay, from: existing.from || "", until: existing.until || "", notes: existing.notes || "" }
        : { available: true, allDay: true, from: "", until: "", notes: "" };
    });
    return initial;
  });

  const toggleWeek = (ws) => {
    setSelectedWeeks((prev) => {
      const next = new Set(prev);
      next.has(ws) ? next.delete(ws) : next.add(ws);
      return next;
    });
  };

  const updateEntry = (iso, patch) => setEntries((prev) => ({ ...prev, [iso]: { ...prev[iso], ...patch } }));

  const activeDates = weekBubbles.filter((w) => selectedWeeks.has(w.weekStart)).flatMap((w) => w.dates);

  if (upcoming.length === 0) return <EmptyState icon="sun" title={t("noUpcomingShowDays")} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("availabilityTitle")}</div>
        <div style={{ color: COLORS.textDim, fontSize: 13.5, marginTop: 2 }}>{t("availabilitySubtitle")}</div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("selectWeeks")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {weekBubbles.map((w) => {
            const active = selectedWeeks.has(w.weekStart);
            const start = w.dates[0];
            const end = w.dates[w.dates.length - 1];
            return (
              <button
                key={w.weekStart}
                onClick={() => toggleWeek(w.weekStart)}
                style={{
                  padding: "9px 16px",
                  borderRadius: 999,
                  border: `1.5px solid ${active ? COLORS.accent : COLORS.borderLight}`,
                  background: active ? COLORS.accentDim : "transparent",
                  color: active ? COLORS.accent : COLORS.textDim,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                {formatRange(start, end, lang)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: COLORS.textFaint, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Icon name="info" size={15} />
        {t("allShowNightsChecked")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {activeDates.map((d) => {
          const iso = toISODate(d);
          const entry = entries[iso];
          const dc = doorsClose[iso] || {};
          return (
            <Card key={iso}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}>{formatShort(d, lang)}</div>
                  {(dc.doors || dc.close) && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {dc.doors && <Badge color={COLORS.textDim}>{t("doors")} {formatTime12(dc.doors)}</Badge>}
                      {dc.close && <Badge color={COLORS.textDim}>{t("close")} {dc.close === "CLOSE" ? t("close").toUpperCase() : formatTime12(dc.close)}</Badge>}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: entry.available ? 14 : 0 }}>
                <Button size="sm" variant={entry.available ? "primary" : "outline"} onClick={() => updateEntry(iso, { available: true })} style={entry.available ? { background: COLORS.green, borderColor: COLORS.green, color: "#052e12" } : {}}>
                  <Icon name="check" size={14} />{t("available")}
                </Button>
                <Button size="sm" variant={!entry.available ? "primary" : "outline"} onClick={() => updateEntry(iso, { available: false })} style={!entry.available ? { background: COLORS.red, borderColor: COLORS.red, color: "#2c0a0a" } : {}}>
                  <Icon name="x" size={14} />{t("notAvailable")}
                </Button>
              </div>

              {!entry.available && (
                <div style={{ fontSize: 12.5, color: COLORS.red, fontWeight: 600 }}>{t("notAvailable")}</div>
              )}

              {entry.available && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant={entry.allDay ? "primary" : "outline"} onClick={() => updateEntry(iso, { allDay: true })}>{t("allDay")}</Button>
                    <Button size="sm" variant={!entry.allDay ? "primary" : "outline"} onClick={() => updateEntry(iso, { allDay: false })}>{t("from")}/{t("until")}</Button>
                  </div>
                  {!entry.allDay && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <TextInput label={t("from")} type="time" value={entry.from} onChange={(v) => updateEntry(iso, { from: v })} />
                      <TextInput label={t("until")} type="time" value={entry.until} onChange={(v) => updateEntry(iso, { until: v })} />
                    </div>
                  )}
                  <TextInput label={t("notes")} value={entry.notes} onChange={(v) => updateEntry(iso, { notes: v })} placeholder="…" />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Button full size="lg" onClick={() => onSubmit(activeDates.map(toISODate).map((iso) => ({ date: iso, ...entries[iso] })))}>
        {t("submitAvailability")}
      </Button>
    </div>
  );
};

/* ================================================================
   EMPLOYEE — TIME OFF
================================================================= */

const TimeOffView = ({ currentUser, isAdmin, timeOff, users, onCreate, onDelete, onDecision }) => {
  const t = useT();
  const { lang } = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const list = isAdmin ? timeOff : timeOff.filter((r) => r.userId === currentUser.id);
  const userName = (id) => users.find((u) => u.id === id)?.name || "—";

  const statusColor = { pending: COLORS.yellow, approved: COLORS.green, denied: COLORS.red };

  const submit = () => {
    if (!start || !end) return;
    onCreate({ startDate: start, endDate: end, reason });
    setSheetOpen(false);
    setStart("");
    setEnd("");
    setReason("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("timeOffTitle")}</div>
        <Button size="sm" onClick={() => setSheetOpen(true)}><Icon name="plus" size={16} />{t("requestTimeOff")}</Button>
      </div>

      {list.length === 0 && <EmptyState icon="calendar" title={t("noTimeOffRequests")} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list
          .slice()
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .map((r) => {
            const isMine = r.userId === currentUser.id;
            const canManage = isAdmin && !isMine;
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    {isAdmin && <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{userName(r.userId)}{isMine ? ` (${t("you")})` : ""}</div>}
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {formatShort(parseISODate(r.startDate), lang)}
                      {r.startDate !== r.endDate && ` – ${formatShort(parseISODate(r.endDate), lang)}`}
                    </div>
                    {r.reason && <div style={{ color: COLORS.textDim, fontSize: 13, marginTop: 4 }}>{r.reason}</div>}
                  </div>
                  <Badge color={statusColor[r.status]}>{t(r.status)}</Badge>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {canManage ? (
                    <>
                      {r.status !== "approved" && <Button size="sm" onClick={() => onDecision(r.id, "approved")}>{t("approve")}</Button>}
                      {r.status !== "denied" && <Button size="sm" variant="outline" onClick={() => onDecision(r.id, "denied")}>{t("deny")}</Button>}
                      <Button size="sm" variant="danger" onClick={() => onDelete(r.id, r.status)}>{t("remove")}</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => onDelete(r.id, r.status)}>{t("deleteRequest")}</Button>
                  )}
                </div>
              </Card>
            );
          })}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("requestTimeOff")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <TextInput label={t("startDate")} type="date" value={start} onChange={setStart} />
            <TextInput label={t("endDate")} type="date" value={end} onChange={setEnd} />
          </div>
          <TextInput label={t("reason")} value={reason} onChange={setReason} placeholder={t("optional")} />
          <Button full onClick={submit}>{t("submitRequest")}</Button>
        </div>
      </Sheet>
    </div>
  );
};

/* ================================================================
   EMPLOYEE — SHIFT SWAPS
================================================================= */

const ShiftSwapsView = ({ currentUser, shifts, giveups, users, departments, onPost, onClaim, onCancel }) => {
  const t = useT();
  const { lang } = useLang();

  const myDeptIds = currentUser.depts || [];
  const myUpcomingShifts = shifts.filter(
    (s) => s.userId === currentUser.id && parseISODate(s.date) >= new Date(new Date().setHours(0, 0, 0, 0))
  );
  const postedShiftIds = new Set(giveups.filter((g) => g.status === "open").map((g) => g.shiftId));

  const claimable = giveups.filter(
    (g) => g.status === "open" && g.fromUserId !== currentUser.id && myDeptIds.includes(shifts.find((s) => s.id === g.shiftId)?.deptId)
  );
  const waiting = giveups.filter((g) => g.status === "open" && g.fromUserId === currentUser.id);
  const mine = giveups.filter((g) => g.fromUserId === currentUser.id || g.claimedBy === currentUser.id);

  const [sheetShift, setSheetShift] = useState(null);
  const [note, setNote] = useState("");

  const shiftLabel = (s) => {
    const dept = departments.find((d) => d.id === s.deptId);
    return `${dept?.name} · ${formatShort(parseISODate(s.date), lang)} · ${s.onCall ? t("onCall") : `${formatTime12(s.start)}–${s.end === "CLOSE" ? "CLOSE" : formatTime12(s.end)}`}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("swapsTitle")}</div>

      <Section title={t("claimable")}>
        {claimable.length === 0 && <EmptyState icon="swap" title={t("noClaimable")} />}
        {claimable.map((g) => {
          const s = shifts.find((x) => x.id === g.shiftId);
          const poster = users.find((u) => u.id === g.fromUserId);
          return (
            <Card key={g.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{shiftLabel(s)}</div>
                  <div style={{ color: COLORS.textDim, fontSize: 12.5, marginTop: 2 }}>from {poster?.name}</div>
                  {g.note && <div style={{ color: COLORS.textDim, fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>"{g.note}"</div>}
                </div>
                <Button size="sm" onClick={() => onClaim(g.id)}>{t("claim")}</Button>
              </div>
            </Card>
          );
        })}
      </Section>

      <Section title={t("waitingPickup")}>
        {waiting.length === 0 && <EmptyState icon="swap" title={t("noWaiting")} />}
        {waiting.map((g) => {
          const s = shifts.find((x) => x.id === g.shiftId);
          return (
            <Card key={g.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{shiftLabel(s)}</div>
                <Button size="sm" variant="danger" onClick={() => onCancel(g.id)}>{t("cancelPost")}</Button>
              </div>
            </Card>
          );
        })}
      </Section>

      <Section title={t("mySwaps")}>
        {myUpcomingShifts.length === 0 && <EmptyState icon="swap" title={t("noMySwaps")} />}
        {myUpcomingShifts.map((s) => (
          <Card key={s.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{shiftLabel(s)}</div>
              {postedShiftIds.has(s.id) ? (
                <Badge color={COLORS.yellow}>{t("waitingPickup")}</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setSheetShift(s)}>{t("postForSwap")}</Button>
              )}
            </div>
          </Card>
        ))}
      </Section>

      <Sheet open={!!sheetShift} onClose={() => setSheetShift(null)} title={t("postShiftForSwap")}>
        {sheetShift && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13.5, color: COLORS.textDim }}>{shiftLabel(sheetShift)}</div>
            <TextInput label={t("swapNote")} value={note} onChange={setNote} placeholder={t("optional")} />
            <Button
              full
              onClick={() => {
                onPost(sheetShift.id, note);
                setSheetShift(null);
                setNote("");
              }}
            >
              {t("postForSwap")}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div>
    <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>{title}</div>
    {children}
  </div>
);

/* ================================================================
   ADMIN — SCHEDULE BUILDER
================================================================= */

const ScheduleBuilder = ({ users, shifts, setShifts, showDays, doorsClose, setDoorsClose, availability, timeOff }) => {
  const t = useT();
  const { lang } = useLang();
  const { departments } = useDepts();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [pending, setPending] = useState(shifts); // local editable copy
  const [publishing, setPublishing] = useState(false);

  useEffect(() => setPending(shifts), [shifts]);

  const weekShowDays = useMemo(
    () => showDays.filter((d) => weekDates(weekStart).map(toISODate).includes(d)).sort(),
    [weekStart, showDays]
  );

  const availabilityFor = (userId, date) => availability.find((a) => a.userId === userId && a.date === date);
  const onApprovedTimeOff = (userId, date) =>
    timeOff.some((r) => r.userId === userId && r.status === "approved" && date >= r.startDate && date <= r.endDate);

  const shiftFor = (userId, date) => pending.find((s) => s.userId === userId && s.date === date);

  const updateShift = (userId, deptId, date, patch) => {
    setPending((prev) => {
      const existing = prev.find((s) => s.userId === userId && s.date === date);
      if (existing) {
        return prev.map((s) => (s === existing ? { ...s, ...patch } : s));
      }
      return [...prev, { id: uid(), userId, deptId, date, start: "", end: "", onCall: false, ...patch }];
    });
  };

  const removeShift = (userId, date) => setPending((prev) => prev.filter((s) => !(s.userId === userId && s.date === date)));

  const hasConflict = (userId, date, start, end) => {
    const avail = availabilityFor(userId, date);
    if (!avail || !avail.available) return true;
    if (avail.allDay) return false;
    return !timeOverlaps(start, end === "CLOSE" ? "23:59" : end, avail.from, avail.until);
  };

  const publish = async () => {
    setPublishing(true);
    try {
      // Replace this week's shifts: delete old ones for these dates, then insert the new set.
      await dbWrite("DELETE", "shifts", { match: { date: weekShowDays } });
      const toInsert = pending.filter((s) => weekShowDays.includes(s.date) && (s.userId));
      await dbWrite("INSERT", "shifts", { rows: toInsert });
      setShifts((prev) => [...prev.filter((s) => !weekShowDays.includes(s.date)), ...toInsert]);
      await sendTelegram(`📋 <b>Schedule published</b> for ${formatRange(weekStart, addDays(weekStart, 6), lang)}.`);
      toast(t("published"));
    } finally {
      setPublishing(false);
    }
  };

  if (showDays.length === 0) return <EmptyState icon="grid" title={t("noShowDaysBuilder")} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("builderTitle")}</div>
        <Button onClick={publish} disabled={publishing}>{t("publish")}</Button>
      </div>

      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      {weekShowDays.length === 0 && <EmptyState icon="grid" title={t("noShowDaysBuilder")} />}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: weekShowDays.length * 220 + 160 }}>
          {/* Doors/Close row */}
          <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekShowDays.length}, 1fr)`, gap: 8, marginBottom: 10 }}>
            <div />
            {weekShowDays.map((date) => {
              const dc = doorsClose[date] || {};
              return (
                <Card key={date} style={{ padding: 10 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{formatShort(parseISODate(date), lang)}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="time"
                      value={dc.doors || ""}
                      onChange={(e) => setDoorsClose((prev) => ({ ...prev, [date]: { ...prev[date], doors: e.target.value } }))}
                      style={{ flex: 1, background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, padding: "6px 8px", color: COLORS.text, fontSize: 12.5 }}
                    />
                    <select
                      value={dc.close === "CLOSE" ? "CLOSE" : "time"}
                      onChange={(e) => setDoorsClose((prev) => ({ ...prev, [date]: { ...prev[date], close: e.target.value === "CLOSE" ? "CLOSE" : "" } }))}
                      style={{ background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, color: COLORS.text, fontSize: 12.5 }}
                    >
                      <option value="time">Time</option>
                      <option value="CLOSE">CLOSE</option>
                    </select>
                    {dc.close !== "CLOSE" && (
                      <input
                        type="time"
                        value={dc.close || ""}
                        onChange={(e) => setDoorsClose((prev) => ({ ...prev, [date]: { ...prev[date], close: e.target.value } }))}
                        style={{ flex: 1, background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, padding: "6px 8px", color: COLORS.text, fontSize: 12.5 }}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Staff grouped by department */}
          {departments.map((dept) => {
            const deptStaff = users.filter((u) => (u.depts || []).includes(dept.id));
            if (deptStaff.length === 0) return null;
            return (
              <div key={dept.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <ColorDot color={dept.color} />
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: dept.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{dept.name}</div>
                </div>
                {deptStaff.map((u) => (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekShowDays.length}, 1fr)`, gap: 8, marginBottom: 8, alignItems: "stretch" }}>
                    <div style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, padding: "0 4px" }}>{u.name}</div>
                    {weekShowDays.map((date) => {
                      const shift = shiftFor(u.id, date);
                      const blocked = onApprovedTimeOff(u.id, date);
                      const avail = availabilityFor(u.id, date);
                      const conflict = shift && !shift.onCall && shift.start && hasConflict(u.id, date, shift.start, shift.end);
                      return (
                        <div
                          key={date}
                          style={{
                            background: blocked ? COLORS.purpleDim : shift?.onCall ? COLORS.yellowDim : COLORS.bgCard,
                            border: `1px solid ${conflict ? COLORS.red : blocked ? "rgba(168,85,247,0.4)" : COLORS.border}`,
                            borderRadius: 10,
                            padding: 8,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {blocked ? (
                            <div style={{ fontSize: 11.5, color: COLORS.purple, fontWeight: 700, textAlign: "center", padding: "8px 0" }}>{t("timeOffBlock")}</div>
                          ) : (
                            <>
                              {avail && (
                                <div style={{ fontSize: 10.5, color: avail.available ? COLORS.blue : COLORS.red, fontWeight: 600 }}>
                                  {avail.available ? (avail.allDay ? t("allDay") : `${formatTime12(avail.from)}–${formatTime12(avail.until)}`) : t("notAvailable")}
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 4 }}>
                                <input
                                  type="time"
                                  disabled={shift?.onCall}
                                  value={shift?.start || ""}
                                  onChange={(e) => updateShift(u.id, dept.id, date, { start: e.target.value, end: shift?.end || "" })}
                                  style={{ width: "50%", background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, padding: "4px 6px", color: COLORS.text, fontSize: 11.5 }}
                                />
                                <select
                                  disabled={shift?.onCall}
                                  value={shift?.end === "CLOSE" ? "CLOSE" : shift?.end ? "time" : ""}
                                  onChange={(e) => updateShift(u.id, dept.id, date, { end: e.target.value === "CLOSE" ? "CLOSE" : "" })}
                                  style={{ width: "50%", background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, color: COLORS.text, fontSize: 11 }}
                                >
                                  <option value="">–</option>
                                  <option value="time">Time</option>
                                  <option value="CLOSE">CLOSE</option>
                                </select>
                              </div>
                              {shift?.end && shift.end !== "CLOSE" && (
                                <input
                                  type="time"
                                  value={shift.end}
                                  onChange={(e) => updateShift(u.id, dept.id, date, { end: e.target.value })}
                                  style={{ background: COLORS.bgRaised, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, padding: "4px 6px", color: COLORS.text, fontSize: 11.5 }}
                                />
                              )}
                              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: COLORS.yellow }}>
                                <input
                                  type="checkbox"
                                  checked={!!shift?.onCall}
                                  onChange={(e) => updateShift(u.id, dept.id, date, { onCall: e.target.checked, start: "", end: "" })}
                                />
                                {t("onCall")}
                              </label>
                              {shift && (
                                <button onClick={() => removeShift(u.id, date)} style={{ background: "none", border: "none", color: COLORS.textFaint, fontSize: 10, textAlign: "left", padding: 0 }}>
                                  {t("delete")}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   ADMIN — SHOW DAYS
================================================================= */

const ShowDaysCalendar = ({ showDays, onToggle }) => {
  const t = useT();
  const { lang } = useLang();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDow = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7; // Monday-first

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{t("showDaysTitle")}</div>
      <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 16 }}>{t("showDaysHelp")}</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <IconButton name="chevronLeft" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} />
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600 }}>
          {month.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "long", year: "numeric" })}
        </div>
        <IconButton name="chevronRight" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: COLORS.textFaint, fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const iso = toISODate(date);
          const marked = showDays.includes(iso);
          return (
            <button
              key={i}
              onClick={() => onToggle(iso)}
              className="ksn-focusable"
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                border: `1.5px solid ${marked ? COLORS.accent : COLORS.border}`,
                background: marked ? COLORS.accent : COLORS.bgCard,
                color: marked ? "#150c04" : COLORS.text,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ================================================================
   ADMIN — AVAILABILITY REVIEW
================================================================= */

const AvailabilityAdmin = ({ users, availability, showDays }) => {
  const t = useT();
  const { lang } = useLang();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const employees = users.filter((u) => !u.isOwner);
  const weekShowDays = showDays.filter((d) => weekDates(weekStart).map(toISODate).includes(d));

  const submitted = employees.filter((u) => weekShowDays.every((d) => availability.some((a) => a.userId === u.id && a.date === d)));
  const notSubmitted = employees.filter((u) => !submitted.includes(u));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("availabilityAdminTitle")}</div>
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      <Section title={`${t("notSubmittedSection")} (${notSubmitted.length})`}>
        {notSubmitted.map((u) => (
          <div key={u.id} style={{ padding: "10px 12px", background: COLORS.redDim, border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, marginBottom: 8, fontSize: 13.5, fontWeight: 600 }}>
            {u.name}
          </div>
        ))}
        {notSubmitted.length === 0 && <div style={{ color: COLORS.textFaint, fontSize: 13 }}>—</div>}
      </Section>

      <Section title={`${t("submittedSection")} (${submitted.length})`}>
        {submitted.map((u) => {
          const entries = weekShowDays.map((d) => availability.find((a) => a.userId === u.id && a.date === d)).filter(Boolean);
          return (
            <Card key={u.id} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{u.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {entries.map((e) => (
                  <Badge key={e.date} color={e.available ? COLORS.green : COLORS.red}>
                    {formatShort(parseISODate(e.date), lang)}: {e.available ? (e.allDay ? t("allDay") : `${formatTime12(e.from)}-${formatTime12(e.until)}`) : t("notAvailable")}
                  </Badge>
                ))}
              </div>
            </Card>
          );
        })}
      </Section>
    </div>
  );
};

/* ================================================================
   ADMIN — SETUP (owner only)
================================================================= */

const SwatchPicker = ({ value, onChange }) => {
  const palette = [COLORS.purple, COLORS.blue, COLORS.yellow, COLORS.accent, COLORS.green, COLORS.red, "#ec4899", "#14b8a6"];
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <ColorDot color={value} size={20} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div style={{ position: "absolute", top: 26, left: 0, zIndex: 20, background: COLORS.bgRaised, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {palette.map((c) => (
            <ColorDot
              key={c}
              color={c}
              size={22}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SetupPage = ({ departments, setDepartments, users, setUsers }) => {
  const t = useT();
  const toast = useToast();
  const [newDeptName, setNewDeptName] = useState("");
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const fileInputRef = useRef(null);

  const addDept = async () => {
    if (!newDeptName.trim()) return;
    const dept = { id: uid(), name: newDeptName.trim(), color: COLORS.blue };
    setDepartments((prev) => [...prev, dept]);
    await dbWrite("INSERT", "departments", { rows: [dept] });
    setNewDeptName("");
  };

  const removeDept = async (id) => {
    if (!window.confirm(t("confirmRemove"))) return;
    setDepartments((prev) => prev.filter((d) => d.id !== id));
    await dbWrite("DELETE", "departments", { match: { id } });
  };

  const recolorDept = async (id, color) => {
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, color } : d)));
    await dbWrite("PATCH", "departments", { match: { id }, patch: { color } });
  };

  const saveUser = async (user) => {
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [...prev, user];
    });
    await dbWrite("UPSERT", "users", { rows: [user] });
    setEditingUser(null);
    setAddStaffOpen(false);
    toast(t("save"));
  };

  const removeUser = async (id) => {
    if (!window.confirm(t("confirmRemove"))) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
    await dbWrite("DELETE", "users", { match: { id } });
  };

  const exportCsv = () => {
    const header = "name,pin,phone,departments,manager,owner";
    const rows = users.map((u) => {
      const deptNames = (u.depts || []).map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join("|");
      return [u.name, u.pin, u.phone || "", deptNames, u.isManager ? "yes" : "no", u.isOwner ? "yes" : "no"].join(",");
    });
    downloadFile("kingdom-scheduler-staff.csv", [header, ...rows].join("\n"));
  };

  const downloadTemplate = () => {
    downloadFile("kingdom-scheduler-staff-template.csv", "name,pin,phone,departments,manager,owner\nJane Doe,1234,555-0100,Bartender|Barback,no,no");
  };

  const importCsv = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const [, ...rows] = lines; // skip header
      const preservedOwnersManagers = users.filter((u) => u.isOwner || u.isManager);
      const imported = rows.map((line) => {
        const [name, pin, phone, deptStr, manager, owner] = line.split(",");
        const deptIds = (deptStr || "").split("|").filter(Boolean).map((n) => departments.find((d) => d.name === n.trim())?.id).filter(Boolean);
        const existing = preservedOwnersManagers.find((u) => u.name.toLowerCase() === (name || "").toLowerCase());
        return {
          id: existing?.id || uid(),
          name: (name || "").trim(),
          pin: (pin || "").trim(),
          phone: (phone || "").trim(),
          depts: deptIds,
          isManager: existing ? existing.isManager : (manager || "").trim().toLowerCase() === "yes",
          isOwner: existing ? existing.isOwner : (owner || "").trim().toLowerCase() === "yes",
        };
      });
      setUsers(imported);
      await dbWrite("UPSERT", "users", { rows: imported });
      toast(t("importCsv"));
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 }}>{t("setupTitle")}</div>

      {/* Departments */}
      <Section title={t("departments")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {departments.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
              <SwatchPicker value={d.color} onChange={(c) => recolorDept(d.id, c)} />
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{d.name}</div>
              <IconButton name="trash" color={COLORS.textFaint} onClick={() => removeDept(d.id)} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <TextInput label="" value={newDeptName} onChange={setNewDeptName} placeholder={t("departmentName")} />
          </div>
          <Button onClick={addDept}><Icon name="plus" size={16} />{t("addDepartment")}</Button>
        </div>
      </Section>

      {/* Staff per department */}
      <Section title={t("staff")}>
        <Button size="sm" onClick={() => setAddStaffOpen(true)} style={{ marginBottom: 14 }}>
          <Icon name="plus" size={16} />{t("addStaff")}
        </Button>
        {departments.map((dept) => {
          const staff = users.filter((u) => (u.depts || []).includes(dept.id)).sort((a, b) => a.name.localeCompare(b.name));
          if (staff.length === 0) return null;
          return (
            <div key={dept.id} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ColorDot color={dept.color} />
                <div style={{ fontSize: 12, fontWeight: 700, color: dept.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{dept.name}</div>
              </div>
              {staff.map((u) => {
                const otherDepts = (u.depts || []).filter((id) => id !== dept.id).map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean);
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.name}{u.isManager && <span style={{ color: COLORS.blue, fontSize: 11 }}> · {t("manager")}</span>}</div>
                      {otherDepts.length > 0 && <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 2 }}>{t("also")} {otherDepts.join(", ")}</div>}
                    </div>
                    <IconButton name="edit" onClick={() => setEditingUser(u)} />
                    <IconButton name="trash" color={COLORS.textFaint} onClick={() => removeUser(u.id)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </Section>

      {/* CSV */}
      <Section title={t("csvImportExport")}>
        <button onClick={() => setCsvOpen((o) => !o)} style={{ background: "none", border: "none", color: COLORS.accent, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: csvOpen ? 12 : 0 }}>
          {csvOpen ? "▾" : "▸"} {t("csvImportExport")}
        </button>
        {csvOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>{t("csvWarning")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={15} />{t("importCsv")}</Button>
              <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={exportCsv}><Icon name="download" size={15} />{t("exportCsv")}</Button>
              <Button size="sm" variant="ghost" onClick={downloadTemplate}>{t("downloadTemplate")}</Button>
            </div>
          </div>
        )}
      </Section>

      <StaffEditSheet
        open={addStaffOpen || !!editingUser}
        user={editingUser}
        departments={departments}
        onClose={() => { setAddStaffOpen(false); setEditingUser(null); }}
        onSave={saveUser}
      />
    </div>
  );
};

const StaffEditSheet = ({ open, user, departments, onClose, onSave }) => {
  const t = useT();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [depts, setDepts] = useState([]);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setPin(user?.pin || "");
      setPhone(user?.phone || "");
      setDepts(user?.depts || []);
      setIsManager(user?.isManager || false);
    }
  }, [open, user]);

  const toggleDept = (id) => setDepts((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  return (
    <Sheet open={open} onClose={onClose} title={user ? t("edit") : t("addStaff")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TextInput label={t("fullName")} value={name} onChange={setName} />
        <div style={{ display: "flex", gap: 10 }}>
          <TextInput label={t("pin")} value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))} />
          <TextInput label={t("phone")} value={phone} onChange={setPhone} />
        </div>
        <div>
          <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 8 }}>{t("alsoWorksIn")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => toggleDept(d.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1.5px solid ${depts.includes(d.id) ? d.color : COLORS.borderLight}`,
                  background: depts.includes(d.id) ? `${d.color}22` : "transparent",
                  color: depts.includes(d.id) ? d.color : COLORS.textDim,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <ColorDot color={d.color} size={8} />
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={isManager} onChange={(e) => setIsManager(e.target.checked)} />
          {t("manager")}
        </label>
        <Button
          full
          onClick={() =>
            onSave({ id: user?.id || uid(), name, pin, phone, depts, isManager, isOwner: user?.isOwner || false })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Sheet>
  );
};

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================
   NAVIGATION
================================================================= */

const NAV_ITEMS = (role) => {
  const base = [
    { key: "schedule", icon: "calendar", labelKey: "navSchedule" },
    { key: "availability", icon: "sun", labelKey: "navAvailability" },
    { key: "timeoff", icon: "clock", labelKey: "navTimeOff" },
    { key: "swaps", icon: "swap", labelKey: "navSwaps" },
  ];
  if (role === "owner" || role === "manager") {
    base.push({ key: "builder", icon: "grid", labelKey: "navBuilder" });
    base.push({ key: "showdays", icon: "calendar", labelKey: "navShowDays" });
  }
  if (role === "owner") {
    base.push({ key: "setup", icon: "settings", labelKey: "navSetup" });
  }
  return base;
};

const TopNav = ({ role, active, onChange, currentUser, onLogout }) => {
  const t = useT();
  const items = NAV_ITEMS(role);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 0, background: "rgba(10,10,15,0.9)", backdropFilter: "blur(8px)", zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17 }}>
          Kingdom <span style={{ color: COLORS.accent }}>Scheduler</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: active === item.key ? COLORS.accentDim : "transparent",
                color: active === item.key ? COLORS.accent : COLORS.textDim,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <Icon name={item.icon} size={16} />
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 13, color: COLORS.textDim }}>{currentUser.name}</div>
        <IconButton name="logout" onClick={onLogout} ariaLabel="Log out" />
      </div>
    </div>
  );
};

const BottomTabBar = ({ role, active, onChange }) => {
  const t = useT();
  const items = NAV_ITEMS(role);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-around",
        background: "rgba(15,15,20,0.96)",
        borderTop: `1px solid ${COLORS.border}`,
        padding: "8px 6px calc(6px + env(safe-area-inset-bottom))",
        zIndex: 100,
        overflowX: "auto",
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            background: "none",
            border: "none",
            color: active === item.key ? COLORS.accent : COLORS.textFaint,
            fontSize: 10.5,
            fontWeight: 600,
            padding: "4px 8px",
            minWidth: 56,
          }}
        >
          <Icon name={item.icon} size={20} />
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
};

/* ================================================================
   ROOT APP
================================================================= */

function AppInner() {
  const t = useT();
  const toast = useToast();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("schedule");

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showDays, setShowDays] = useState([]);
  const [doorsClose, setDoorsClose] = useState({});
  const [shifts, setShifts] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [giveups, setGiveups] = useState([]);

  useEffect(() => {
    (async () => {
      const [u, d, s, av, to, gu, showDaysState, doorsCloseState] = await Promise.all([
        dbSelect("users"),
        dbSelect("departments"),
        dbSelect("shifts"),
        dbSelect("availability"),
        dbSelect("time_off_requests"),
        dbSelect("giveup_requests"),
        dbSelect("app_state"),
        Promise.resolve(null),
      ]);

      if (DEMO_MODE) {
        setUsers(DEMO_USERS);
        setDepartments(DEMO_DEPARTMENTS);
        setShowDays(DEMO_SHOW_DAYS);
        setDoorsClose(DEMO_DOORS_CLOSE);
        setShifts(DEMO_SHIFTS);
        setAvailability([]);
        setTimeOff([]);
        setGiveups([]);
      } else {
        setUsers((u || []).map(normalizeUser));
        setDepartments(d || []);
        setShifts((s || []).map(normalizeShift));
        setAvailability((av || []).map(normalizeAvailability));
        setTimeOff((to || []).map(normalizeTimeOff));
        setGiveups((gu || []).map(normalizeGiveup));
        const showDaysRow = (showDaysState || []).find((r) => r.key === "show_days");
        const doorsCloseRow = (showDaysState || []).find((r) => r.key === "doors_close");
        setShowDays(showDaysRow?.value || []);
        setDoorsClose(doorsCloseRow?.value || {});
      }
      setLoading(false);
    })();
  }, []);

  const role = !currentUser ? null : currentUser.isOwner ? "owner" : currentUser.isManager ? "manager" : "employee";
  const isAdmin = role === "owner" || role === "manager";

  useEffect(() => {
    if (currentUser) setActiveTab("schedule");
  }, [currentUser]);

  /* ---- handlers that also persist to Supabase (best-effort) ---- */

  const submitAvailability = async (entries) => {
    const rows = entries.map((e) => ({
      id: uid(),
      userId: currentUser.id,
      date: e.date,
      available: e.available,
      allDay: e.allDay,
      from: e.from,
      until: e.until,
      notes: e.notes,
    }));
    setAvailability((prev) => [...prev.filter((a) => !(a.userId === currentUser.id && entries.some((e) => e.date === a.date))), ...rows]);
    await dbWrite("UPSERT", "availability", { rows });
    toast(t("availabilitySubmitted"));
  };

  const createTimeOff = async (payload) => {
    const row = { id: uid(), userId: currentUser.id, startDate: payload.startDate, endDate: payload.endDate, reason: payload.reason, status: "pending" };
    setTimeOff((prev) => [...prev, row]);
    await dbWrite("INSERT", "time_off_requests", { rows: [row] });
    await sendTelegram(`🗓️ <b>Time off requested</b>\n${currentUser.name}: ${payload.startDate} – ${payload.endDate}${payload.reason ? `\n"${payload.reason}"` : ""}`);
  };

  const deleteTimeOff = async (id, status) => {
    if (status === "approved" && !window.confirm(t("approveApprovedWarning"))) return;
    setTimeOff((prev) => prev.filter((r) => r.id !== id));
    await dbWrite("DELETE", "time_off_requests", { match: { id } });
  };

  const decideTimeOff = async (id, status) => {
    setTimeOff((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    await dbWrite("PATCH", "time_off_requests", { match: { id }, patch: { status } });
    // Silent — no Telegram for approve/deny per spec.
  };

  const postSwap = async (shiftId, note) => {
    const row = { id: uid(), shiftId, fromUserId: currentUser.id, note, status: "open", claimedBy: null };
    setGiveups((prev) => [...prev, row]);
    await dbWrite("INSERT", "giveup_requests", { rows: [row] });
    const shift = shifts.find((s) => s.id === shiftId);
    const dept = departments.find((d) => d.id === shift?.deptId);
    await sendTelegram(`🔄 <b>Shift posted for pickup</b>\n${currentUser.name} · ${dept?.name} · ${shift?.date}${note ? `\n"${note}"` : ""}`);
  };

  const cancelSwap = async (id) => {
    setGiveups((prev) => prev.filter((g) => g.id !== id));
    await dbWrite("DELETE", "giveup_requests", { match: { id } });
  };

  const claimSwap = async (id) => {
    const giveup = giveups.find((g) => g.id === id);
    setGiveups((prev) => prev.map((g) => (g.id === id ? { ...g, status: "claimed", claimedBy: currentUser.id } : g)));
    setShifts((prev) => prev.map((s) => (s.id === giveup.shiftId ? { ...s, userId: currentUser.id } : s)));
    await dbWrite("PATCH", "giveup_requests", { match: { id }, patch: { status: "claimed", claimedBy: currentUser.id } });
    await dbWrite("PATCH", "shifts", { match: { id: giveup.shiftId }, patch: { userId: currentUser.id } });
    await sendTelegram(`✅ <b>Shift claimed</b> by ${currentUser.name}`);
    toast(t("claimedShift"));
  };

  const toggleShowDay = async (iso) => {
    const next = showDays.includes(iso) ? showDays.filter((d) => d !== iso) : [...showDays, iso].sort();
    setShowDays(next);
    await dbWrite("UPSERT", "app_state", { key: "show_days", value: next });
  };

  const persistDoorsClose = useCallback(async (updater) => {
    setDoorsClose((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dbWrite("UPSERT", "app_state", { key: "doors_close", value: next });
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontFamily: FONT_DISPLAY }}>
        Kingdom Scheduler…
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={setCurrentUser} />;
  }

  return (
    <DeptContext.Provider value={{ departments, setDepartments }}>
      <div style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: isMobile ? 76 : 0 }}>
        {!isMobile && (
          <TopNav role={role} active={activeTab} onChange={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} />
        )}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "20px 16px" : "28px" }}>
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16 }}>
                Kingdom <span style={{ color: COLORS.accent }}>Scheduler</span>
              </div>
              <IconButton name="logout" onClick={() => setCurrentUser(null)} />
            </div>
          )}

          {activeTab === "schedule" && (
            <ScheduleView currentUser={currentUser} shifts={shifts} users={users} showDays={showDays} doorsClose={doorsClose} />
          )}
          {activeTab === "availability" && (
            <AvailabilityView currentUser={currentUser} showDays={showDays} doorsClose={doorsClose} availability={availability} onSubmit={submitAvailability} />
          )}
          {activeTab === "timeoff" && (
            <TimeOffView
              currentUser={currentUser}
              isAdmin={isAdmin}
              timeOff={timeOff}
              users={users}
              onCreate={createTimeOff}
              onDelete={deleteTimeOff}
              onDecision={decideTimeOff}
            />
          )}
          {activeTab === "swaps" && (
            <ShiftSwapsView
              currentUser={currentUser}
              shifts={shifts}
              giveups={giveups}
              users={users}
              departments={departments}
              onPost={postSwap}
              onClaim={claimSwap}
              onCancel={cancelSwap}
            />
          )}
          {activeTab === "builder" && isAdmin && (
            <ScheduleBuilder
              users={users}
              shifts={shifts}
              setShifts={setShifts}
              showDays={showDays}
              doorsClose={doorsClose}
              setDoorsClose={persistDoorsClose}
              availability={availability}
              timeOff={timeOff}
            />
          )}
          {activeTab === "showdays" && isAdmin && <ShowDaysCalendar showDays={showDays} onToggle={toggleShowDay} />}
          {activeTab === "setup" && role === "owner" && (
            <SetupPage departments={departments} setDepartments={setDepartments} users={users} setUsers={setUsers} />
          )}
        </div>

        {isMobile && <BottomTabBar role={role} active={activeTab} onChange={setActiveTab} />}
      </div>
    </DeptContext.Provider>
  );
}

/* Normalize snake_case-ish Supabase rows into the camelCase shape used above.
   Adjust these if your column names differ from schema.sql. */
function normalizeUser(u) {
  return { id: u.id, name: u.name, pin: u.pin, phone: u.phone, depts: u.depts || [], isManager: u.is_manager ?? u.isManager ?? false, isOwner: u.is_owner ?? u.isOwner ?? false };
}
function normalizeShift(s) {
  return { id: s.id, date: s.date, deptId: s.dept_id ?? s.deptId, userId: s.user_id ?? s.userId, start: s.start_time ?? s.start, end: s.end_time ?? s.end, onCall: s.on_call ?? s.onCall ?? false };
}
function normalizeAvailability(a) {
  return { id: a.id, userId: a.user_id ?? a.userId, date: a.date, available: a.available, allDay: a.all_day ?? a.allDay, from: a.from_time ?? a.from, until: a.until_time ?? a.until, notes: a.notes };
}
function normalizeTimeOff(r) {
  return { id: r.id, userId: r.user_id ?? r.userId, startDate: r.start_date ?? r.startDate, endDate: r.end_date ?? r.endDate, reason: r.reason, status: r.status };
}
function normalizeGiveup(g) {
  return { id: g.id, shiftId: g.shift_id ?? g.shiftId, fromUserId: g.from_user_id ?? g.fromUserId, note: g.note, status: g.status, claimedBy: g.claimed_by ?? g.claimedBy };
}

export default function KingdomScheduler() {
  const [lang, setLang] = useState("en");
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      <ToastProvider>
        <GlobalStyle />
        <AppInner />
      </ToastProvider>
    </LanguageContext.Provider>
  );
}
