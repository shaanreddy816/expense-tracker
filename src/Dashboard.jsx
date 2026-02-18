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
import emailjs from "@emailjs/browser";

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

  // ---------- email alerts (temporarily disabled) ----------
  // ---------- email alerts ----------
const [emailAlerts, setEmailAlerts] = useState(false);
const [alertThreshold, setAlertThreshold] = useState(5000);
const [alertEmail, setAlertEmail] = useState("");
const [emailSent, setEmailSent] = useState(false);

useEffect(() => {
  emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY);
}, []);

useEffect(() => {
  if (!emailAlerts || !alertEmail || balance > alertThreshold || emailSent) return;

  const templateParams = {
    to_email: alertEmail,
    balance: money(balance),
    threshold: money(alertThreshold),
    month: month,
  };

  emailjs.send(
    import.meta.env.VITE_EMAILJS_SERVICE_ID,
    import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    templateParams
  )
    .then(() => {
      toast.success("Low balance alert sent");
      setEmailSent(true);
    })
    .catch((error) => {
      toast.error("Email failed: " + error.text);
    });
}, [balance, emailAlerts, alertThreshold, alertEmail, emailSent, month]);

useEffect(() => {
  if (balance > alertThreshold) {
    setEmailSent(false);
  }
}, [balance, alertThreshold]);

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
    <div className="container">
      <ToastContainer />

      {showTour && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeTour}
        >
          <div
            style={{
              background: "white",
              padding: 30,
              borderRadius: 20,
              maxWidth: 500,
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>👋 Welcome to Expense Tracker!</h2>
            <p>Here’s what you can do:</p>
            <ul>
              <li>📅 <strong>Select any month</strong> at the top</li>
              <li>➕ <strong>Add incomes & expenses</strong> – they become monthly equivalents</li>
              <li>👨‍👩‍👧 <strong>Assign expenses to family members</strong></li>
              <li>💰 <strong>Set monthly & yearly spending limits</strong> – you’ll see progress bars and alerts</li>
              <li>📊 <strong>Plan budgets per category</strong> – green/orange/red shows how you’re doing</li>
              <li>🔔 <strong>Set reminders</strong> for bills</li>
              <li>👥 <strong>Switch between profiles</strong> – each has its own data</li>
              <li>📸 <strong>Scan receipts</strong> with your camera</li>
            </ul>
            <p>All your data is saved in your browser.</p>
            <button className="btn btnPrimary" onClick={closeTour}>
              Got it, let's start!
            </button>
          </div>
        </div>
      )}

      <div className="topbar">
        <div>
          <h1 className="h1">💰 Expense Tracker</h1>
          <div className="pill">
            Logged in as <b>{email}</b> • Profile: <b>{currentProfile}</b>
          </div>
        </div>

        <div className="row">
          <div className="pill" style={{ display: "flex", gap: 5 }}>
            <select
              value={currentProfile}
              onChange={(e) => switchProfile(e.target.value)}
              style={{ background: "transparent", border: "none" }}
            >
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button className="iconBtn" onClick={addProfile} title="Add profile">
              ➕
            </button>
          </div>

          <div className="grow">
            <label>📅 Show month</label>
            <input
              type="month"
              className="input"
              value={month}
              onChange={(e) => {
                const m = e.target.value;
                setMonth(m);
                persist({ ...snapshot(), month: m });
              }}
            />
          </div>
          <button className="btn" onClick={resetAll}>🔄 Reset all</button>
          <button className="btn btnDanger" onClick={handleLogout}>🚪 Logout</button>
          <button className="btn" onClick={exportData} title="Backup data">📥 Backup</button>
          <button className="btn" onClick={() => fileInputRef.current.click()} title="Restore data">📤 Restore</button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".json"
            onChange={importData}
          />
          <button className="btn" onClick={() => fileInputRefCsv.current.click()} title="Import bank CSV">
            🏦 Import CSV
          </button>
          <input
            type="file"
            ref={fileInputRefCsv}
            style={{ display: "none" }}
            accept=".csv"
            onChange={handleCsvUpload}
          />
          <button className="btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid3">
        <div className="panel">
          <div className="kpiLabel">📥 Monthly Income</div>
          <div className="kpiValue">{money(monthIncome)}</div>
          <div className="kpiHint">All income converted to monthly</div>
        </div>
        <div className="panel">
          <div className="kpiLabel">📤 Monthly Expenses</div>
          <div className="kpiValue">{money(monthExpense)}</div>
          <div className="kpiHint">All expenses converted to monthly</div>
        </div>
        <div className="panel">
          <div className="kpiLabel">💸 Balance for Investments</div>
          <div className="kpiValue">{money(balance)}</div>
          <div className="kpiHint">Income − Expenses (monthly)</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Spending Limits */}
      <div className="grid2">
        <div className="panel">
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>📆 Your monthly spending limit</div>
          <div className="row">
            <div className="grow">
              <label>Set limit (₹)</label>
              <input
                type="number"
                className="input"
                value={monthlyLimit || ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMonthlyLimit(val >= 0 ? val : 0);
                  persist({ ...snapshot(), monthlyLimit: val >= 0 ? val : 0 });
                }}
                placeholder="e.g. 50000"
              />
            </div>
          </div>
          {monthlyLimit > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Used: {money(monthExpense)}</span>
                <span>Limit: {money(monthlyLimit)}</span>
              </div>
              <div
                style={{
                  height: 20,
                  background: "#e9e9e9",
                  borderRadius: 10,
                  marginTop: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(monthlyLimitPct, 100)}%`,
                    height: "100%",
                    background:
                      monthlyLimitStatus === "ok"
                        ? "#4caf50"
                        : monthlyLimitStatus === "warn"
                        ? "#ff9800"
                        : "#f44336",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, marginTop: 5, color: "var(--muted)" }}>
                {monthlyLimitStatus === "ok" && "✅ Under 80% – good"}
                {monthlyLimitStatus === "warn" && "⚠️ Between 80‑100% – watch out"}
                {monthlyLimitStatus === "danger" && "🔴 Over limit!"}
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>📅 Your yearly spending target</div>
          <div className="row">
            <div className="grow">
              <label>Set target (₹)</label>
              <input
                type="number"
                className="input"
                value={yearlyLimit || ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setYearlyLimit(val >= 0 ? val : 0);
                  persist({ ...snapshot(), yearlyLimit: val >= 0 ? val : 0 });
                }}
                placeholder="e.g. 600000"
              />
            </div>
          </div>
          {yearlyLimit > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Used (YTD): {money(yearlyExpense)}</span>
                <span>Target: {money(yearlyLimit)}</span>
              </div>
              <div
                style={{
                  height: 20,
                  background: "#e9e9e9",
                  borderRadius: 10,
                  marginTop: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(yearlyLimitPct, 100)}%`,
                    height: "100%",
                    background:
                      yearlyLimitStatus === "ok"
                        ? "#4caf50"
                        : yearlyLimitStatus === "warn"
                        ? "#ff9800"
                        : "#f44336",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, marginTop: 5, color: "var(--muted)" }}>
                {yearlyLimitStatus === "ok" && "✅ Under 80% – good"}
                {yearlyLimitStatus === "warn" && "⚠️ Between 80‑100% – watch out"}
                {yearlyLimitStatus === "danger" && "🔴 Over target!"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Budget Summary */}
      <div className="grid3">
        <div className="panel">
          <div className="kpiLabel">📋 Planned Bills (Monthly)</div>
          <div className="kpiValue">{money(totalPlanned)}</div>
          <div className="kpiHint">Sum of category budgets for {month}</div>
        </div>
        <div className="panel">
          <div className="kpiLabel">📈 Over Planned</div>
          <div className="kpiValue">{money(overAmt)}</div>
          <div className="kpiHint">0 if within planned</div>
        </div>
        <div className="panel">
          <div className="kpiLabel">📊 Over %</div>
          <div className="kpiValue">{totalPlanned > 0 ? `${overPct.toFixed(1)}%` : "—"}</div>
          <div className="kpiHint">Green ≤ 0%, Orange 10–15%, Red &gt; 20%</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className={`alert ${budgetStatus}`}>
        {monthExpense <= totalPlanned ? (
          <b>✅ On track:</b>
        ) : budgetStatus === "warn" ? (
          <b>🟠 Warning:</b>
        ) : (
          <b>🔴 Danger:</b>
        )}{" "}
        Planned {money(totalPlanned)} vs Actual {money(monthExpense)} for <b>{month}</b>.
      </div>

      <div style={{ height: 14 }} />

      {/* Add Income & Expense */}
      <div className="grid2">
        {/* Income Panel */}
        <div className="panel">
          <div style={{ fontWeight: 900, marginBottom: 12 }}>➕ Add Income</div>
          <div className="row">
            <div className="grow">
              <label>Source</label>
              <input
                className="input"
                value={incomeType}
                onChange={(e) => setIncomeType(e.target.value)}
                placeholder="Salary / Rent"
              />
            </div>
            <div className="grow">
              <label>Amount (₹)</label>
              <input
                className="input"
                value={incomeAmt}
                onChange={(e) => setIncomeAmt(e.target.value)}
                placeholder="e.g. 7500"
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">
              <label>How often?</label>
              <select value={incomeFreq} onChange={(e) => setIncomeFreq(Number(e.target.value))}>
                {FREQS.map((f) => (
                  <option key={f.months} value={f.months}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btnPrimary" onClick={addIncome}>
              ➕ Add Income
            </button>
          </div>
          <div className="note">💡 Income is split into monthly amount (e.g. yearly ÷ 12).</div>
          <div style={{ height: 10 }} />
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Your Income List</div>
          {incomes.length === 0 ? (
            <div className="note">No income added yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Amount</th>
                  <th>Freq</th>
                  <th>Start</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {incomes.slice(0, 8).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.type}</b>
                    </td>
                    <td>{money(i.amount)}</td>
                    <td>{i.freqMonths} mo</td>
                    <td>{i.startMonth}</td>
                    <td>
                      <button className="iconBtn" onClick={() => deleteIncome(i.id)} title="Delete">
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expense Panel */}
        <div className="panel">
          <div style={{ fontWeight: 900, marginBottom: 12 }}>➕ Add Expense</div>
          <div style={{ marginBottom: 10 }}>
            <label>📸 Scan Receipt</label>
            <div className="row">
              <input
                type="file"
                accept="image/*"
                onChange={handleReceiptUpload}
                style={{ display: "none" }}
                id="receipt-upload"
              />
              <button
                className="btn"
                onClick={() => document.getElementById("receipt-upload").click()}
              >
                Upload Receipt Image
              </button>
            </div>
          </div>
          <div className="row">
            <div className="grow">
              <label>What did you spend on?</label>
              <input
                className="input"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="e.g. Groceries"
              />
            </div>
            <div className="grow">
              <label>Amount (₹)</label>
              <input
                className="input"
                value={expenseAmt}
                onChange={(e) => setExpenseAmt(e.target.value)}
                placeholder="e.g. 250"
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">
              <label>Category</label>
              <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_ICONS[c] || "📌"} {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label>How often?</label>
              <select value={expenseFreq} onChange={(e) => setExpenseFreq(Number(e.target.value))}>
                {FREQS.map((f) => (
                  <option key={f.months} value={f.months}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">
              <label>Who spent?</label>
              <select value={expensePerson} onChange={(e) => setExpensePerson(e.target.value)}>
                {familyMembers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label>Remind me on</label>
              <input
                type="date"
                className="input"
                value={expenseReminderDate}
                onChange={(e) => setExpenseReminderDate(e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btnPrimary" onClick={addExpense}>
              ➕ Add Expense
            </button>
          </div>

          {/* Category & Family member management */}
          <div className="row" style={{ marginTop: 15 }}>
            <div className="grow">
              <label>➕ New category</label>
              <div className="row">
                <input
                  className="input"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. Netflix"
                />
                <button className="btn" onClick={addCategory}>
                  + Add
                </button>
              </div>
            </div>
            <div className="grow">
              <label>➕ New family member</label>
              <div className="row">
                <input
                  className="input"
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  placeholder="e.g. Son"
                />
                <button className="btn" onClick={addFamilyMember}>
                  + Add
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Family members: </span>
            {familyMembers.map((m) => (
              <span key={m} className="pill" style={{ marginRight: 5 }}>
                {m}
                {m !== "Me" && (
                  <button
                    className="iconBtn"
                    onClick={() => removeFamilyMember(m)}
                    style={{ padding: 2 }}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>

          <div style={{ height: 10 }} />

          {/* Expense list with filter */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontWeight: 900 }}>Your Expenses</div>
            <div style={{ display: "flex", gap: 8 }}>
              <label>Filter by:</label>
              <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
                <option value="All">All</option>
                {familyMembers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredExpenses.length === 0 ? (
            <div className="note">No expenses for this filter.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Freq</th>
                  <th>Start</th>
                  <th>Person</th>
                  <th>Reminder</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.title}</b>
                    </td>
                    <td>
                      {CATEGORY_ICONS[e.category] || "📌"} {e.category}
                    </td>
                    <td>{money(e.amount)}</td>
                    <td>{e.freqMonths} mo</td>
                    <td>{e.startMonth}</td>
                    <td>{e.person}</td>
                    <td>{e.reminderDate || "—"}</td>
                    <td>
                      <button className="iconBtn" onClick={() => deleteExpense(e.id)} title="Delete">
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="note">
            💡 Balance = Income − Expenses. Use balance for savings, investments, or emergency fund.
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Email alerts panel (disabled for now) */}
      <div className="panel">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>📧 Low Balance Alerts</div>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="grow" style={{ flex: "0 0 auto" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
              />
              Enable
            </label>
          </div>
          <div className="grow">
            <label>Alert if balance below (₹)</label>
            <input
              type="number"
              className="input"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(Number(e.target.value))}
            />
          </div>
          <div className="grow">
            <label>Email to notify</label>
            <input
              type="email"
              className="input"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <div className="note">
          You'll get an email when your calculated balance (income − expenses) drops below the threshold.
          One email per threshold crossing.
          <br />
          <em>(Email alerts temporarily disabled – set up EmailJS credentials to enable)</em>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Category Budgets */}
      <div className="panel">
        <div className="topbar" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>📋 Set monthly budget for each category</div>
          <div className="pill">Choose category and amount (starts from selected month)</div>
        </div>
        <div className="row">
          <div className="grow" style={{ position: "relative" }}>
            <label>Category</label>
            <div className="row" style={{ gap: 5 }}>
              <select
                value={planCategory}
                onChange={(e) => setPlanCategory(e.target.value)}
                style={{ flex: 1 }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_ICONS[c] || "📌"} {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="New"
                value={newBudgetCategory}
                onChange={(e) => setNewBudgetCategory(e.target.value)}
                style={{ width: "80px", padding: "8px" }}
              />
              <button
                className="btn"
                onClick={() => {
                  const c = newBudgetCategory.trim();
                  if (c && !categories.includes(c)) {
                    const nextCategories = [...categories, c];
                    setCategories(nextCategories);
                    setPlanCategory(c);
                    setNewBudgetCategory("");
                    persist({ ...snapshot(), categories: nextCategories });
                  }
                }}
              >
                ➕
              </button>
            </div>
          </div>
          <div className="grow">
            <label>Monthly budget (₹)</label>
            <input
              className="input"
              value={planAmt}
              onChange={(e) => setPlanAmt(e.target.value)}
              placeholder="e.g. 1500"
            />
          </div>
          <button className="btn btnPrimary" onClick={setPlannedBudget}>
            💾 Save budget
          </button>
        </div>
        <div className="note">
          ✅ Green = within budget • 🟠 Orange = 10–15% over • 🔴 Red = &gt;20% over
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Category Report */}
      <div className="panel">
        <div className="topbar" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            📊 Category wise – Budget vs Actual for {month}
          </div>
          <div className="pill">Switch month above to see history</div>
        </div>
        {reportRows.length === 0 ? (
          <div className="note">Add budgets and expenses to see comparison.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Budget</th>
                <th>Actual</th>
                <th>Diff</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((r) => (
                <tr key={r.category}>
                  <td>
                    <b>
                      {CATEGORY_ICONS[r.category] || "📌"} {r.category}
                    </b>
                  </td>
                  <td>{money(r.plannedVal)}</td>
                  <td>{money(r.actualVal)}</td>
                  <td>{money(r.diff)}</td>
                  <td>
                    {r.tag === "ok" ? (
                      <span className="tag tagOk">✅ GREEN</span>
                    ) : r.tag === "warn" ? (
                      <span className="tag tagWarn">🟠 ORANGE</span>
                    ) : (
                      <span className="tag tagDanger">🔴 RED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ height: 14 }} />

      {/* Chart */}
      <div className="panel">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>📊 Spending Chart</div>
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

      <div style={{ height: 14 }} />

      {/* Spending by Person */}
      <div className="panel">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>👨‍👩‍👧 Spending by family member</div>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Monthly equivalent</th>
            </tr>
          </thead>
          <tbody>
            {expensesByPerson.map(([person, amt]) => (
              <tr key={person}>
                <td>
                  <b>{person}</b>
                </td>
                <td>{money(amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">Shows monthly equivalent for each person based on current month.</div>
      </div>
    </div>
  );
}