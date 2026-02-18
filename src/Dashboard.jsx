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

  // Simple return for now
  return <div>Phase 1 – imports and constants added</div>;
}