import { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { COGNITO_DOMAIN } from "./authConfig";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Papa from "papaparse";
// emailjs import removed

console.log("Dashboard module is loading");

const STORAGE_KEY_PREFIX = "expense_tracker_";
const TOUR_SEEN_KEY = "expense_tracker_tour_seen";
const PROFILES_STORAGE_KEY = "expense_profiles";
const CURRENT_PROFILE_KEY = "current_profile";

const FREQS = [
  { label: "Monthly", months: 1 },
  { label: "Every 3 months", months: 3 },
  { label: "Every 6 months", months: 6 },
  { label: "Yearly", months: 12 },
  { label: "Every 2 years", months: 24 },
  { label: "Every 3 years", months: 36 },
  { label: "Every 5 years", months: 60 },
];

const DEFAULT_CATEGORIES = [
  "Home EMI",
  "Car EMI",
  "Petrol",
  "Internet",
  "Current Bill",
  "Gas Bill",
  "Groceries",
  "Maid Bill",
  "Apartment Maintenance",
  "Health Insurance",
  "Term Insurance",
  "Car Insurance",
  "Emergency Fund",
  "Other",
];

const DEFAULT_FAMILY = ["Me", "Wife", "Kid"];

const CATEGORY_ICONS = {
  "Home EMI": "🏠",
  "Car EMI": "🚗",
  Petrol: "⛽",
  Internet: "🌐",
  "Current Bill": "💡",
  "Gas Bill": "🔥",
  Groceries: "🛒",
  "Maid Bill": "🧹",
  "Apartment Maintenance": "🏢",
  "Health Insurance": "❤️",
  "Term Insurance": "⚕️",
  "Car Insurance": "🚘",
  "Emergency Fund": "🆘",
  Other: "📦",
};

function money(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

function currentMonth() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

function loadState(profile) {
  const key = STORAGE_KEY_PREFIX + profile;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(profile, state) {
  const key = STORAGE_KEY_PREFIX + profile;
  localStorage.setItem(key, JSON.stringify(state));
}

function appliesToMonth(startMonth, month) {
  if (!startMonth) return true;
  return startMonth <= month;
}

function monthsOfYear(year) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

export default function Dashboard() {
  const auth = useAuth();
  const email =
    auth.user?.profile?.email ||
    auth.user?.profile?.preferred_username ||
    "Unknown user";

  // ---------- profile management ----------
  const [profiles, setProfiles] = useState(() => {
    const saved = localStorage.getItem(PROFILES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : ["Me", "Wife", "Kid"];
  });
  const [currentProfile, setCurrentProfile] = useState(() => {
    return localStorage.getItem(CURRENT_PROFILE_KEY) || "Me";
  });

  const switchProfile = (newProfile) => {
    localStorage.setItem(CURRENT_PROFILE_KEY, newProfile);
    window.location.reload();
  };

  const addProfile = () => {
    const name = prompt("Enter new profile name (e.g., Wife, Kid)");
    if (name && !profiles.includes(name)) {
      const newProfiles = [...profiles, name];
      setProfiles(newProfiles);
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(newProfiles));
      switchProfile(name);
    }
  };

  // ---------- app state (per profile) ----------
  const boot = useMemo(() => {
    const saved = loadState(currentProfile);
    if (saved) return saved;

    return {
      categories: DEFAULT_CATEGORIES,
      familyMembers: DEFAULT_FAMILY,
      month: currentMonth(),
      incomes: [],
      expenses: [],
      planned: [],
      monthlyLimit: 0,
      yearlyLimit: 0,
    };
  }, [currentProfile]);

  const [month, setMonth] = useState(boot.month || currentMonth());
  const [categories, setCategories] = useState(boot.categories || DEFAULT_CATEGORIES);
  const [familyMembers, setFamilyMembers] = useState(boot.familyMembers || DEFAULT_FAMILY);
  const [incomes, setIncomes] = useState(boot.incomes || []);
  const [expenses, setExpenses] = useState(boot.expenses || []);
  const [planned, setPlanned] = useState(boot.planned || []);
  const [monthlyLimit, setMonthlyLimit] = useState(boot.monthlyLimit || 0);
  const [yearlyLimit, setYearlyLimit] = useState(boot.yearlyLimit || 0);

  // UI form states
  const [incomeType, setIncomeType] = useState("Salary");
  const [incomeAmt, setIncomeAmt] = useState("");
  const [incomeFreq, setIncomeFreq] = useState(1);

  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Other");
  const [expenseFreq, setExpenseFreq] = useState(1);
  const [expensePerson, setExpensePerson] = useState("Me");
  const [expenseReminderDate, setExpenseReminderDate] = useState("");

  const [newCategory, setNewCategory] = useState("");
  const [newMember, setNewMember] = useState("");

  const [planCategory, setPlanCategory] = useState("Home EMI");
  const [planAmt, setPlanAmt] = useState("");
  const [newBudgetCategory, setNewBudgetCategory] = useState("");

  const [filterPerson, setFilterPerson] = useState("All");
  const [activeTab, setActiveTab] = useState("overview"); // for mobile bottom nav

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
    if (darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [darkMode]);

  // ---------- onboarding tour ----------
  const [showTour, setShowTour] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY));
  const closeTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    setShowTour(false);
  };

  // ---------- helper functions ----------
  const fileInputRef = useRef(null);
  const fileInputRefCsv = useRef(null);

  const snapshot = () => ({
    categories,
    familyMembers,
    month,
    incomes,
    expenses,
    planned,
    monthlyLimit,
    yearlyLimit,
  });

  const persist = (next) => saveState(currentProfile, next);

  const exportData = () => {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-tracker-${currentProfile}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.categories && data.familyMembers && data.month) {
          setCategories(data.categories);
          setFamilyMembers(data.familyMembers);
          setMonth(data.month);
          setIncomes(data.incomes || []);
          setExpenses(data.expenses || []);
          setPlanned(data.planned || []);
          setMonthlyLimit(data.monthlyLimit || 0);
          setYearlyLimit(data.yearlyLimit || 0);
          persist(data);
          toast.success("Data restored successfully!");
        } else {
          toast.error("Invalid backup file.");
        }
      } catch (err) {
        toast.error("Error reading file.");
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  // ---------- CSV import ----------
  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newExpenses = [];
        results.data.forEach((row) => {
          const date = row.Date || row["Transaction Date"] || row["Date"];
          const description = row.Description || row.Narration || row["Transaction Description"];
          const amount = parseFloat(row.Amount || row["Debit Amount"] || row["Withdrawal"] || row["Debit"]);
          const type = (row.Type || row["Transaction Type"] || row["Mode"] || "").toLowerCase();

          if (amount && (type.includes("debit") || type.includes("withdrawal") || type.includes("payment") || type.includes("pos") || type.includes("atm"))) {
            let startMonth = month;
            if (date) {
              const parts = date.split(/[-\/]/);
              if (parts.length === 3) {
                let day, monthNum, year;
                if (parseInt(parts[0]) > 12) {
                  [day, monthNum, year] = parts;
                } else {
                  [monthNum, day, year] = parts;
                }
                startMonth = `${year}-${monthNum.padStart(2, "0")}`;
              }
            }
            newExpenses.push({
              id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
              title: description ? description.substring(0, 30) : "Bank Transaction",
              amount: amount,
              category: "Other",
              freqMonths: 1,
              startMonth: startMonth,
              person: "Me",
            });
          }
        });

        if (newExpenses.length > 0) {
          setExpenses((prev) => [...newExpenses, ...prev]);
          persist({ ...snapshot(), expenses: [...newExpenses, ...expenses] });
          toast.success(`Imported ${newExpenses.length} expenses`);
        } else {
          toast.warn("No expense transactions found in CSV");
        }
      },
      error: (error) => {
        toast.error("CSV parse error: " + error.message);
      },
    });
    event.target.value = null;
  };

  // ---------- receipt scanning ----------
  const handleReceiptUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const loadingToast = toast.loading("Scanning receipt...");

    try {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          base64Image: `data:image/jpeg;base64,${base64}`,
          language: "eng",
          isOverlayRequired: false,
        }),
      });

      const data = await response.json();
      toast.dismiss(loadingToast);

      if (data.IsErroredOnProcessing) {
        toast.error("Could not read receipt. Try a clearer image.");
        return;
      }

      const text = data.ParsedResults[0].ParsedText;
      const amountMatch = text.match(/[₹]?\s*(\d+(?:[.,]\d+)?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(",", "")) : null;

      if (amount) {
        setExpenseAmt(amount.toString());
        const lower = text.toLowerCase();
        if (lower.includes("grocery") || lower.includes("supermarket")) {
          setExpenseCategory("Groceries");
        } else if (lower.includes("restaurant") || lower.includes("cafe") || lower.includes("food")) {
          setExpenseCategory("Outside Food");
        } else if (lower.includes("petrol") || lower.includes("fuel")) {
          setExpenseCategory("Petrol");
        } else if (lower.includes("electricity") || lower.includes("bill")) {
          setExpenseCategory("Current Bill");
        }
        toast.success("Receipt scanned! Please review the amount and category.");
      } else {
        toast.warn("Could not detect amount. Please enter manually.");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Scan failed: " + error.message);
    }
  };

  // ---------- calculations ----------
  const monthIncome = useMemo(() => {
    return incomes
      .filter((i) => appliesToMonth(i.startMonth, month))
      .reduce((sum, i) => sum + (Number(i.amount) || 0) / (Number(i.freqMonths) || 1), 0);
  }, [incomes, month]);

  const monthExpense = useMemo(() => {
    return expenses
      .filter((e) => appliesToMonth(e.startMonth, month))
      .reduce((sum, e) => sum + (Number(e.amount) || 0) / (Number(e.freqMonths) || 1), 0);
  }, [expenses, month]);

  const balance = Math.max(0, monthIncome - monthExpense);

  const plannedByCategory = useMemo(() => {
    const map = new Map();
    for (const c of categories) map.set(c, 0);

    const byCat = new Map();
    for (const p of planned) {
      if (!appliesToMonth(p.startMonth, month)) continue;
      const prev = byCat.get(p.category);
      if (!prev || prev.startMonth < p.startMonth) byCat.set(p.category, p);
    }

    for (const [cat, rec] of byCat.entries()) {
      map.set(cat, Number(rec.monthlyPlanned) || 0);
    }
    return map;
  }, [planned, categories, month]);

  const actualByCategory = useMemo(() => {
    const map = new Map();
    for (const c of categories) map.set(c, 0);

    for (const e of expenses) {
      if (!appliesToMonth(e.startMonth, month)) continue;
      const eq = (Number(e.amount) || 0) / (Number(e.freqMonths) || 1);
      map.set(e.category, (map.get(e.category) || 0) + eq);
    }
    return map;
  }, [expenses, categories, month]);

  const totalPlanned = useMemo(() => {
    let t = 0;
    for (const c of categories) t += plannedByCategory.get(c) || 0;
    return t;
  }, [plannedByCategory, categories]);

  const overAmt = Math.max(0, monthExpense - totalPlanned);
  const overPct = totalPlanned > 0 ? (overAmt / totalPlanned) * 100 : 0;

  const budgetStatus = useMemo(() => {
    if (monthExpense <= totalPlanned) return "ok";
    if (overPct >= 10 && overPct <= 15) return "warn";
    if (overPct > 20) return "danger";
    return "warn";
  }, [monthExpense, totalPlanned, overPct]);

  const reportRows = useMemo(() => {
    return categories
      .filter((c) => (plannedByCategory.get(c) || 0) > 0 || (actualByCategory.get(c) || 0) > 0)
      .map((c) => {
        const plannedVal = plannedByCategory.get(c) || 0;
        const actualVal = actualByCategory.get(c) || 0;
        const diff = actualVal - plannedVal;
        const pct = plannedVal > 0 ? (diff / plannedVal) * 100 : 0;

        let tag = "ok";
        if (diff > 0) {
          if (pct >= 10 && pct <= 15) tag = "warn";
          else if (pct > 20) tag = "danger";
          else tag = "warn";
        }
        return { category: c, plannedVal, actualVal, diff, pct, tag };
      });
  }, [categories, plannedByCategory, actualByCategory]);

  const expensesByPerson = useMemo(() => {
    const map = new Map();
    for (const p of familyMembers) map.set(p, 0);
    for (const e of expenses) {
      if (!appliesToMonth(e.startMonth, month)) continue;
      const eq = (Number(e.amount) || 0) / (Number(e.freqMonths) || 1);
      const person = e.person || "Me";
      map.set(person, (map.get(person) || 0) + eq);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [expenses, familyMembers, month]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => appliesToMonth(e.startMonth, month))
      .filter((e) => filterPerson === "All" || e.person === filterPerson);
  }, [expenses, month, filterPerson]);

  const yearlyExpense = useMemo(() => {
    const currentYear = month.split("-")[0];
    const monthsThisYear = monthsOfYear(currentYear).filter((m) => m <= month);
    let total = 0;
    for (const m of monthsThisYear) {
      const monthTotal = expenses
        .filter((e) => appliesToMonth(e.startMonth, m))
        .reduce((sum, e) => sum + (Number(e.amount) || 0) / (Number(e.freqMonths) || 1), 0);
      total += monthTotal;
    }
    return total;
  }, [expenses, month]);

  const monthlyLimitPct = monthlyLimit > 0 ? (monthExpense / monthlyLimit) * 100 : 0;
  const monthlyLimitStatus =
    monthlyLimit === 0
      ? "none"
      : monthExpense <= monthlyLimit * 0.8
      ? "ok"
      : monthExpense <= monthlyLimit
      ? "warn"
      : "danger";

  const yearlyLimitPct = yearlyLimit > 0 ? (yearlyExpense / yearlyLimit) * 100 : 0;
  const yearlyLimitStatus =
    yearlyLimit === 0
      ? "none"
      : yearlyExpense <= yearlyLimit * 0.8
      ? "ok"
      : yearlyExpense <= yearlyLimit
      ? "warn"
      : "danger";

  const chartData = useMemo(() => {
    return categories
      .filter((c) => (plannedByCategory.get(c) || 0) > 0 || (actualByCategory.get(c) || 0) > 0)
      .map((c) => ({
        name: c,
        Planned: plannedByCategory.get(c) || 0,
        Actual: actualByCategory.get(c) || 0,
      }));
  }, [categories, plannedByCategory, actualByCategory]);

  // ---------- notifications ----------
  useEffect(() => {
    if (monthlyLimit === 0) return;
    const pct = (monthExpense / monthlyLimit) * 100;
    if (pct >= 100) {
      toast.error("🔴 You've exceeded your monthly limit!", {
        position: "top-center",
        autoClose: false,
      });
    } else if (pct >= 80) {
      toast.warn("🟠 You've used 80% of your monthly limit", {
        position: "top-center",
        autoClose: false,
      });
    }
  }, [monthExpense, monthlyLimit]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    expenses.forEach((e) => {
      if (e.reminderDate && e.reminderDate <= today && !e.reminderNotified) {
        toast.info(`🔔 Reminder: ${e.title} (${money(e.amount)})`, {
          autoClose: false,
        });
        e.reminderNotified = true;
        persist(snapshot());
      }
    });
  }, [expenses]);

  // ---------- actions ----------
  const handleLogout = async () => {
    await auth.removeUser?.();
    const logoutUrl =
      `${COGNITO_DOMAIN}/logout` +
      `?client_id=${auth.settings.client_id}` +
      `&logout_uri=${encodeURIComponent(auth.settings.post_logout_redirect_uri)}`;
    window.location.href = logoutUrl;
  };

  const addCategory = () => {
    const c = newCategory.trim();
    if (!c || categories.includes(c)) return;
    const nextCategories = [...categories, c];
    setCategories(nextCategories);
    setNewCategory("");
    persist({ ...snapshot(), categories: nextCategories });
  };

  const addFamilyMember = () => {
    const m = newMember.trim();
    if (!m || familyMembers.includes(m)) return;
    const nextMembers = [...familyMembers, m];
    setFamilyMembers(nextMembers);
    setNewMember("");
    persist({ ...snapshot(), familyMembers: nextMembers });
  };

  const removeFamilyMember = (member) => {
    if (member === "Me") return;
    const nextMembers = familyMembers.filter((m) => m !== member);
    setFamilyMembers(nextMembers);
    const nextExpenses = expenses.map((e) =>
      e.person === member ? { ...e, person: "Me" } : e
    );
    setExpenses(nextExpenses);
    if (filterPerson === member) setFilterPerson("All");
    persist({ ...snapshot(), familyMembers: nextMembers, expenses: nextExpenses });
  };

  const addIncome = () => {
    const amt = Number(incomeAmt);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const rec = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type: incomeType.trim() || "Income",
      amount: amt,
      freqMonths: Number(incomeFreq) || 1,
      startMonth: month,
    };
    const nextIncomes = [rec, ...incomes];
    setIncomes(nextIncomes);
    setIncomeAmt("");
    persist({ ...snapshot(), incomes: nextIncomes });
  };

  const deleteIncome = (id) => {
    const nextIncomes = incomes.filter((x) => x.id !== id);
    setIncomes(nextIncomes);
    persist({ ...snapshot(), incomes: nextIncomes });
  };

  const addExpense = () => {
    const amt = Number(expenseAmt);
    if (!expenseTitle.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const rec = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: expenseTitle.trim(),
      amount: amt,
      category: expenseCategory,
      freqMonths: Number(expenseFreq) || 1,
      startMonth: month,
      person: expensePerson,
      reminderDate: expenseReminderDate || undefined,
      reminderNotified: false,
    };
    const nextExpenses = [rec, ...expenses];
    setExpenses(nextExpenses);
    setExpenseTitle("");
    setExpenseAmt("");
    setExpenseReminderDate("");
    persist({ ...snapshot(), expenses: nextExpenses });
  };

  const deleteExpense = (id) => {
    const nextExpenses = expenses.filter((x) => x.id !== id);
    setExpenses(nextExpenses);
    persist({ ...snapshot(), expenses: nextExpenses });
  };

  const setPlannedBudget = () => {
    const amt = Number(planAmt);
    if (!Number.isFinite(amt) || amt < 0) return;
    const rec = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
      category: planCategory,
      monthlyPlanned: amt,
      startMonth: month,
    };
    const nextPlanned = [rec, ...planned];
    setPlanned(nextPlanned);
    setPlanAmt("");
    persist({ ...snapshot(), planned: nextPlanned });
  };

  const resetAll = () => {
    const next = {
      categories: DEFAULT_CATEGORIES,
      familyMembers: DEFAULT_FAMILY,
      month: currentMonth(),
      incomes: [],
      expenses: [],
      planned: [],
      monthlyLimit: 0,
      yearlyLimit: 0,
    };
    setCategories(next.categories);
    setFamilyMembers(next.familyMembers);
    setMonth(next.month);
    setIncomes([]);
    setExpenses([]);
    setPlanned([]);
    setMonthlyLimit(0);
    setYearlyLimit(0);
    persist(next);
  };

  // ---------- render ----------
  if (auth.isLoading) return <div className="container">Loading…</div>;
  if (auth.error) return <div className="container">Error: {auth.error.message}</div>;

  return (
    <div className="app">
      <ToastContainer />

      {/* Onboarding tour */}
      {showTour && (
        <div className="tour-overlay" onClick={closeTour}>
          <div className="tour-card" onClick={(e) => e.stopPropagation()}>
            <h2>👋 Welcome to Expense Tracker!</h2>
            <p>Here's what you can do:</p>
            <ul>
              <li>📅 <strong>Select any month</strong> at the top</li>
              <li>➕ <strong>Add incomes & expenses</strong> – they become monthly equivalents</li>
              <li>👨‍👩‍👧 <strong>Assign expenses to family members</strong></li>
              <li>💰 <strong>Set monthly & yearly spending limits</strong> – you'll see progress bars and alerts</li>
              <li>📊 <strong>Plan budgets per category</strong> – green/orange/red shows how you're doing</li>
              <li>🔔 <strong>Set reminders</strong> for bills</li>
              <li>👥 <strong>Switch between profiles</strong> – each has its own data</li>
              <li>📸 <strong>Scan receipts</strong> with your camera</li>
            </ul>
            <p>All your data is saved in your browser.</p>
            <button className="btn btnPrimary" onClick={closeTour}>Got it, let's start!</button>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>💰 Expense Tracker</h1>
          <div className="profile-badge">
            <span className="email">{email}</span>
            <div className="profile-selector">
              <select value={currentProfile} onChange={(e) => switchProfile(e.target.value)}>
                {profiles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="icon-btn" onClick={addProfile} title="Add profile">➕</button>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="month-picker">
            <label>📅 Month</label>
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); persist({ ...snapshot(), month: e.target.value }); }} />
          </div>
          <button className="btn btn-secondary" onClick={resetAll}>🔄 Reset</button>
          <button className="btn btn-danger" onClick={handleLogout}>🚪 Logout</button>
          <button className="btn btn-secondary" onClick={exportData} title="Backup">📥 Backup</button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()} title="Restore">📤 Restore</button>
          <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".json" onChange={importData} />
          <button className="btn btn-secondary" onClick={() => fileInputRefCsv.current.click()} title="Import CSV">🏦 CSV</button>
          <input type="file" ref={fileInputRefCsv} style={{ display: "none" }} accept=".csv" onChange={handleCsvUpload} />
          <button className="btn btn-secondary" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Bottom Navigation (mobile) */}
      <nav className="bottom-nav">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>📊 Overview</button>
        <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>➕ Add</button>
        <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>📈 Reports</button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>⚙️ Settings</button>
      </nav>

      {/* Main Content */}
      <main className="dashboard-content">
        {/* Overview Section */}
        <section className={`section overview-section ${activeTab === 'overview' ? 'active' : ''}`}>
          <h2>Overview</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Monthly Income</span>
              <span className="kpi-value">{money(monthIncome)}</span>
              <span className="kpi-hint">All income converted to monthly</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Monthly Expenses</span>
              <span className="kpi-value">{money(monthExpense)}</span>
              <span className="kpi-hint">All expenses converted to monthly</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Balance</span>
              <span className="kpi-value">{money(balance)}</span>
              <span className="kpi-hint">Income − Expenses</span>
            </div>
          </div>

          <div className="limits-grid">
            <div className="limit-card">
              <h3>Monthly Limit</h3>
              <input type="number" value={monthlyLimit || ""} onChange={(e) => { const val = Number(e.target.value); setMonthlyLimit(val >= 0 ? val : 0); persist({ ...snapshot(), monthlyLimit: val >= 0 ? val : 0 }); }} placeholder="Set limit" />
              {monthlyLimit > 0 && (
                <>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(monthlyLimitPct, 100)}%`, background: monthlyLimitStatus === 'ok' ? '#4caf50' : monthlyLimitStatus === 'warn' ? '#ff9800' : '#f44336' }}></div>
                  </div>
                  <div className="limit-status">
                    Used {money(monthExpense)} / {money(monthlyLimit)}
                  </div>
                </>
              )}
            </div>
            <div className="limit-card">
              <h3>Yearly Target</h3>
              <input type="number" value={yearlyLimit || ""} onChange={(e) => { const val = Number(e.target.value); setYearlyLimit(val >= 0 ? val : 0); persist({ ...snapshot(), yearlyLimit: val >= 0 ? val : 0 }); }} placeholder="Set target" />
              {yearlyLimit > 0 && (
                <>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(yearlyLimitPct, 100)}%`, background: yearlyLimitStatus === 'ok' ? '#4caf50' : yearlyLimitStatus === 'warn' ? '#ff9800' : '#f44336' }}></div>
                  </div>
                  <div className="limit-status">
                    Used {money(yearlyExpense)} / {money(yearlyLimit)}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="budget-summary">
            <div className="summary-card">
              <span className="summary-label">Planned Bills</span>
              <span className="summary-value">{money(totalPlanned)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Over Planned</span>
              <span className="summary-value">{money(overAmt)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Over %</span>
              <span className="summary-value">{totalPlanned > 0 ? `${overPct.toFixed(1)}%` : "—"}</span>
            </div>
          </div>

          <div className={`alert ${budgetStatus}`}>
            {monthExpense <= totalPlanned ? "✅ On track" : budgetStatus === "warn" ? "🟠 Warning" : "🔴 Danger"} – Planned {money(totalPlanned)} vs Actual {money(monthExpense)}
          </div>
        </section>

        {/* Add Section */}
        <section className={`section add-section ${activeTab === 'add' ? 'active' : ''}`}>
          <h2>Add Transaction</h2>

          {/* Income Form */}
          <div className="form-card">
            <h3>➕ Add Income</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Source</label>
                <input type="text" value={incomeType} onChange={(e) => setIncomeType(e.target.value)} placeholder="Salary / Rent" />
              </div>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" value={incomeAmt} onChange={(e) => setIncomeAmt(e.target.value)} placeholder="e.g. 7500" />
              </div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={incomeFreq} onChange={(e) => setIncomeFreq(Number(e.target.value))}>
                  {FREQS.map(f => <option key={f.months} value={f.months}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" onClick={addIncome}>Add Income</button>
          </div>

          {/* Expense Form */}
          <div className="form-card">
            <h3>➕ Add Expense</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Title</label>
                <input type="text" value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="e.g. Groceries" />
              </div>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" value={expenseAmt} onChange={(e) => setExpenseAmt(e.target.value)} placeholder="e.g. 250" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || "📌"} {c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={expenseFreq} onChange={(e) => setExpenseFreq(Number(e.target.value))}>
                  {FREQS.map(f => <option key={f.months} value={f.months}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Person</label>
                <select value={expensePerson} onChange={(e) => setExpensePerson(e.target.value)}>
                  {familyMembers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Remind on</label>
                <input type="date" value={expenseReminderDate} onChange={(e) => setExpenseReminderDate(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={addExpense}>Add Expense</button>
              <div className="receipt-scan">
                <label>📸 Scan Receipt</label>
                <input type="file" accept="image/*" onChange={handleReceiptUpload} id="receipt-upload" style={{ display: "none" }} />
                <button className="btn btn-secondary" onClick={() => document.getElementById("receipt-upload").click()}>Upload</button>
              </div>
            </div>
          </div>

          {/* Quick Add Category & Member */}
          <div className="quick-add-grid">
            <div className="quick-add">
              <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" />
              <button className="btn btn-secondary" onClick={addCategory}>+ Add</button>
            </div>
            <div className="quick-add">
              <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="New family member" />
              <button className="btn btn-secondary" onClick={addFamilyMember}>+ Add</button>
            </div>
          </div>

          {/* Income List */}
          <div className="list-card">
            <h3>Your Income</h3>
            {incomes.length === 0 ? (
              <p className="empty-state">No income added yet.</p>
            ) : (
              <table className="list-table">
                <thead>
                  <tr><th>Source</th><th>Amount</th><th>Freq</th><th>Start</th><th></th></tr>
                </thead>
                <tbody>
                  {incomes.slice(0, 8).map(i => (
                    <tr key={i.id}>
                      <td>{i.type}</td>
                      <td>{money(i.amount)}</td>
                      <td>{i.freqMonths} mo</td>
                      <td>{i.startMonth}</td>
                      <td><button className="icon-btn" onClick={() => deleteIncome(i.id)}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Expense List with Filter */}
          <div className="list-card">
            <div className="list-header">
              <h3>Your Expenses</h3>
              <div className="filter">
                <label>Filter: </label>
                <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
                  <option value="All">All</option>
                  {familyMembers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {filteredExpenses.length === 0 ? (
              <p className="empty-state">No expenses for this filter.</p>
            ) : (
              <table className="list-table">
                <thead>
                  <tr><th>Title</th><th>Category</th><th>Amount</th><th>Freq</th><th>Start</th><th>Person</th><th>Reminder</th><th></th></tr>
                </thead>
                <tbody>
                  {filteredExpenses.slice(0, 10).map(e => (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td>{CATEGORY_ICONS[e.category] || "📌"} {e.category}</td>
                      <td>{money(e.amount)}</td>
                      <td>{e.freqMonths} mo</td>
                      <td>{e.startMonth}</td>
                      <td>{e.person}</td>
                      <td>{e.reminderDate || "—"}</td>
                      <td><button className="icon-btn" onClick={() => deleteExpense(e.id)}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Reports Section */}
        <section className={`section reports-section ${activeTab === 'reports' ? 'active' : ''}`}>
          <h2>Reports</h2>

          {/* Category Budgets */}
          <div className="card">
            <h3>Category Budgets</h3>
            <div className="budget-row">
              <select value={planCategory} onChange={(e) => setPlanCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || "📌"} {c}</option>)}
              </select>
              <input type="number" value={planAmt} onChange={(e) => setPlanAmt(e.target.value)} placeholder="Monthly budget" />
              <button className="btn btn-primary" onClick={setPlannedBudget}>Save</button>
            </div>
            <div className="quick-budget">
              <input type="text" value={newBudgetCategory} onChange={(e) => setNewBudgetCategory(e.target.value)} placeholder="New category" />
              <button className="btn btn-secondary" onClick={() => {
                const c = newBudgetCategory.trim();
                if (c && !categories.includes(c)) {
                  setCategories([...categories, c]);
                  setPlanCategory(c);
                  setNewBudgetCategory("");
                  persist({ ...snapshot(), categories: [...categories, c] });
                }
              }}>➕ Add & Select</button>
            </div>
          </div>

          {/* Category Report Table */}
          <div className="card">
            <h3>Category Report</h3>
            {reportRows.length === 0 ? (
              <p className="empty-state">Add budgets and expenses to see comparison.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr><th>Category</th><th>Budget</th><th>Actual</th><th>Diff</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {reportRows.map(r => (
                    <tr key={r.category}>
                      <td>{CATEGORY_ICONS[r.category] || "📌"} {r.category}</td>
                      <td>{money(r.plannedVal)}</td>
                      <td>{money(r.actualVal)}</td>
                      <td>{money(r.diff)}</td>
                      <td>{r.tag === 'ok' ? '✅' : r.tag === 'warn' ? '🟠' : '🔴'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Chart */}
          <div className="card">
            <h3>Spending Chart</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Legend />
                <Bar dataKey="Planned" fill="#8884d8" />
                <Bar dataKey="Actual" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spending by Person */}
          <div className="card">
            <h3>Spending by Person</h3>
            <table className="person-table">
              <thead><tr><th>Person</th><th>Monthly</th></tr></thead>
              <tbody>
                {expensesByPerson.map(([p, amt]) => (
                  <tr key={p}><td>{p}</td><td>{money(amt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Settings Section */}
        <section className={`section settings-section ${activeTab === 'settings' ? 'active' : ''}`}>
          <h2>Settings</h2>

          {/* Data Management */}
          <div className="card">
            <h3>Data Management</h3>
            <div className="settings-row">
              <button className="btn btn-secondary" onClick={exportData}>📥 Backup Data</button>
              <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>📤 Restore Data</button>
            </div>
            <div className="settings-row">
              <button className="btn btn-secondary" onClick={() => fileInputRefCsv.current.click()}>🏦 Import CSV</button>
            </div>
          </div>

          {/* Profile Management */}
          <div className="card">
            <h3>Profiles</h3>
            <div className="profile-list">
              {profiles.map(p => (
                <div key={p} className="profile-item">
                  <span>{p}</span>
                  {p !== "Me" && <button className="icon-btn" onClick={() => removeFamilyMember(p)}>✕</button>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}