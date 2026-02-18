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
  const email = auth.user?.profile?.email || auth.user?.profile?.preferred_username || "Unknown user";

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

  // ---------- helper functions (Phase 3A) ----------
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
      // Convert file to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(file);
      });

      // Call OCR.space API (replace YOUR_API_KEY)
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
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

      // Extract amount (simple regex)
      const amountMatch = text.match(/[₹]?\s*(\d+(?:[.,]\d+)?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(",", "")) : null;

      if (amount) {
        setExpenseAmt(amount.toString());

        // Try to guess category from keywords
        const lower = text.toLowerCase();
        if (lower.includes("grocery") || lower.includes("supermarket")) {
          setExpenseCategory("Groceries");
        } else if (lower.includes("restaurant") || lower.includes("cafe") || lower.includes("food")) {
          setExpenseCategory("Outside Food");
        } else if (lower.includes("petrol") || lower.includes("fuel")) {
          setExpenseCategory("Petrol");
        } else if (lower.includes("electricity") || lower.includes("bill")) {
          setExpenseCategory("Current Bill");
        } // add more rules as needed

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

  // Simple return for now
  return <div>Phase 1 – imports and constants added</div>;
}