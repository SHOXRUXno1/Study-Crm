import { formatCurrencyUZS } from "@/lib/utils";

export type CourseStatus = "active" | "inactive";
export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type GroupStatus = "active" | "completed";

export type CourseCategoryKey = "general" | "skills" | "examPrep" | "kids";

export interface Course {
  id: string;
  name: string;
  description: string;
  categoryKey: CourseCategoryKey;
  level: CourseLevel;
  durationMonths: number;
  price: number;
  totalStudents: number;
  totalLessons: number;
  totalGroups: number;
  status: CourseStatus;
  teacher: string;
}

export interface Group {
  id: string;
  code: string;
  course: string;
  teacher: string;
  students: number;
  maxStudents: number;
  status: GroupStatus;
  days: string[];
  timeSlot: string;
  startDate: string;
  endDate: string;
  /** Monthly price in UZS */
  price: number;
}

export type AttendanceStatus = "active" | "no-show" | "contacted";

export interface GroupStudent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  paymentStatus: "paid" | "debt";
  enrollDate: string;
  /** Engagement status — independent of payment. Defaults to "active". */
  attendanceStatus?: AttendanceStatus;
  /** Number of lessons the learner actually attended. Defaults to >0 when omitted. */
  attendedLessons?: number;
}

export const LEVEL_COLORS: Record<CourseLevel, string> = {
  beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  advanced: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

export function formatPrice(price: number): string {
  return formatCurrencyUZS(price);
}

export const COURSE_CATEGORY_KEYS: CourseCategoryKey[] = ["general", "skills", "examPrep", "kids"];

export const courses: Course[] = [
  { id: "1", name: "English", description: "General English course for all levels.", categoryKey: "general", level: "beginner", durationMonths: 6, price: 4_500_000, totalStudents: 48, totalLessons: 72, totalGroups: 3, status: "active", teacher: "Emily Richards" },
  { id: "2", name: "Grammar", description: "English grammar from fundamentals to advanced.", categoryKey: "skills", level: "beginner", durationMonths: 4, price: 3_500_000, totalStudents: 40, totalLessons: 48, totalGroups: 3, status: "active", teacher: "Robert Clarke" },
  { id: "3", name: "Pre-IELTS", description: "Preparation course before IELTS level.", categoryKey: "examPrep", level: "intermediate", durationMonths: 3, price: 4_800_000, totalStudents: 35, totalLessons: 48, totalGroups: 2, status: "active", teacher: "James Thompson" },
  { id: "4", name: "KIDS' English", description: "Fun English classes for young learners.", categoryKey: "kids", level: "beginner", durationMonths: 9, price: 4_000_000, totalStudents: 24, totalLessons: 108, totalGroups: 2, status: "active", teacher: "Elena Volkova" },
  { id: "5", name: "IELTS", description: "IELTS exam preparation – all four modules.", categoryKey: "examPrep", level: "advanced", durationMonths: 4, price: 5_700_000, totalStudents: 42, totalLessons: 64, totalGroups: 3, status: "active", teacher: "Sarah Mitchell" },
  { id: "6", name: "CEFR", description: "Common European Framework of Reference course.", categoryKey: "general", level: "intermediate", durationMonths: 5, price: 4_200_000, totalStudents: 30, totalLessons: 60, totalGroups: 2, status: "active", teacher: "David Brown" },
];

export function formatDuration(months: number, lang: "en" | "ru" | "uz"): string {
  if (lang === "uz") return `${months} oy`;
  if (lang === "en") return `${months} ${months === 1 ? "month" : "months"}`;
  // ru
  const mod10 = months % 10;
  const mod100 = months % 100;
  let word = "месяцев";
  if (mod10 === 1 && mod100 !== 11) word = "месяц";
  else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) word = "месяца";
  return `${months} ${word}`;
}

export const groups: Group[] = [
  { id: "1", code: "IELTS-A1", course: "IELTS", teacher: "Emily Richards", students: 14, maxStudents: 16, status: "active", days: ["Mon", "Wed", "Fri"], timeSlot: "09:00–10:30", startDate: "2026-01-15", endDate: "2026-06-15", price: 550_000 },
  { id: "2", code: "IELTS-A2", course: "IELTS", teacher: "Emily Richards", students: 16, maxStudents: 16, status: "active", days: ["Tue", "Thu"], timeSlot: "10:00–11:30", startDate: "2026-02-01", endDate: "2026-07-01", price: 550_000 },
  { id: "3", code: "IELTS-B1", course: "IELTS", teacher: "Lisa Anderson", students: 5, maxStudents: 16, status: "active", days: ["Tue", "Thu", "Sat"], timeSlot: "09:00–10:30", startDate: "2026-10-01", endDate: "2027-03-01", price: 600_000 },
  { id: "4", code: "GEN-B2", course: "English", teacher: "James Thompson", students: 18, maxStudents: 20, status: "active", days: ["Tue", "Thu"], timeSlot: "10:00–12:00", startDate: "2026-02-01", endDate: "2026-07-01", price: 450_000 },
  { id: "5", code: "GEN-C3", course: "English", teacher: "Sophie Martin", students: 20, maxStudents: 20, status: "completed", days: ["Mon", "Wed", "Fri"], timeSlot: "09:00–11:00", startDate: "2025-09-01", endDate: "2026-01-31", price: 450_000 },
  { id: "6", code: "GEN-A1", course: "English", teacher: "James Thompson", students: 14, maxStudents: 18, status: "active", days: ["Mon", "Wed"], timeSlot: "15:00–17:00", startDate: "2026-01-01", endDate: "2026-09-01", price: 400_000 },
  { id: "7", code: "PRE-I01", course: "Pre-IELTS", teacher: "Sarah Mitchell", students: 12, maxStudents: 15, status: "active", days: ["Mon", "Wed"], timeSlot: "14:00–15:30", startDate: "2026-01-20", endDate: "2026-06-20", price: 700_000 },
  { id: "8", code: "CEFR-B1", course: "CEFR", teacher: "Michael Harris", students: 15, maxStudents: 15, status: "completed", days: ["Tue", "Thu"], timeSlot: "10:00–11:30", startDate: "2025-08-15", endDate: "2026-01-15", price: 700_000 },
  { id: "9", code: "GRAM-A2", course: "Grammar", teacher: "Robert Clarke", students: 16, maxStudents: 16, status: "active", days: ["Tue", "Thu", "Sat"], timeSlot: "11:00–12:30", startDate: "2026-03-01", endDate: "2026-08-01", price: 380_000 },
  { id: "10", code: "KIDS-A1", course: "KIDS' English", teacher: "Elena Volkova", students: 10, maxStudents: 16, status: "active", days: ["Mon", "Fri"], timeSlot: "16:00–17:30", startDate: "2026-02-10", endDate: "2026-07-10", price: 420_000 },
  { id: "11", code: "KIDS-B1", course: "KIDS' English", teacher: "Elena Volkova", students: 0, maxStudents: 18, status: "active", days: ["Wed", "Fri"], timeSlot: "13:00–14:30", startDate: "2026-09-01", endDate: "2027-02-01", price: 350_000 },
];

// Mock students per group
export const groupStudents: Record<string, GroupStudent[]> = {
  "1": [
    { id: "1", firstName: "Sarah", lastName: "Johnson", phone: "+998 90 123 4501", paymentStatus: "paid", enrollDate: "2024-01-15" },
    { id: "2", firstName: "Michael", lastName: "Chen", phone: "+998 90 123 4502", paymentStatus: "paid", enrollDate: "2024-01-18" },
    { id: "3", firstName: "Emily", lastName: "Davis", phone: "+998 90 123 4503", paymentStatus: "debt", enrollDate: "2024-01-20" },
    { id: "11", firstName: "Emma", lastName: "Anderson", phone: "+998 90 123 4511", paymentStatus: "paid", enrollDate: "2024-01-22" },
    { id: "14", firstName: "Amir", lastName: "Karimov", phone: "+998 90 456 7801", paymentStatus: "paid", enrollDate: "2024-01-25" },
    { id: "15", firstName: "Dilnoza", lastName: "Rahimova", phone: "+998 90 456 7802", paymentStatus: "paid", enrollDate: "2024-02-01" },
    { id: "16", firstName: "Bobur", lastName: "Aliyev", phone: "+998 90 456 7803", paymentStatus: "paid", enrollDate: "2024-02-03" },
    { id: "17", firstName: "Shaxlo", lastName: "Nazarova", phone: "+998 90 456 7804", paymentStatus: "debt", enrollDate: "2024-02-05" },
    { id: "18", firstName: "Jasur", lastName: "Umarov", phone: "+998 90 456 7805", paymentStatus: "paid", enrollDate: "2024-02-08" },
    { id: "19", firstName: "Madina", lastName: "Tosheva", phone: "+998 90 456 7806", paymentStatus: "paid", enrollDate: "2024-02-10" },
    { id: "20", firstName: "Sardor", lastName: "Abdullayev", phone: "+998 90 456 7807", paymentStatus: "paid", enrollDate: "2024-02-12" },
    { id: "21", firstName: "Nilufar", lastName: "Ismoilova", phone: "+998 90 456 7808", paymentStatus: "paid", enrollDate: "2024-02-15" },
    { id: "22", firstName: "Otabek", lastName: "Rustamov", phone: "+998 90 456 7809", paymentStatus: "paid", enrollDate: "2024-02-18" },
    { id: "23", firstName: "Zarina", lastName: "Mirzayeva", phone: "+998 90 456 7810", paymentStatus: "debt", enrollDate: "2024-02-20" },
  ],
  "2": [
    { id: "24", firstName: "Aziz", lastName: "Tursunov", phone: "+998 90 567 0001", paymentStatus: "paid", enrollDate: "2024-02-01" },
    { id: "25", firstName: "Kamola", lastName: "Yusupova", phone: "+998 90 567 0002", paymentStatus: "paid", enrollDate: "2024-02-03" },
    { id: "26", firstName: "Rustam", lastName: "Sharipov", phone: "+998 90 567 0003", paymentStatus: "paid", enrollDate: "2024-02-05", attendanceStatus: "contacted", attendedLessons: 0 },
    { id: "27", firstName: "Malika", lastName: "Olimova", phone: "+998 90 567 0004", paymentStatus: "debt", enrollDate: "2024-02-08" },
    { id: "4", firstName: "Alex", lastName: "Rivera", phone: "+998 90 123 4504", paymentStatus: "paid", enrollDate: "2024-02-10" },
    { id: "28", firstName: "Doniyor", lastName: "Ergashev", phone: "+998 90 567 0005", paymentStatus: "paid", enrollDate: "2024-02-12" },
    { id: "29", firstName: "Gulnora", lastName: "Bekmurodova", phone: "+998 90 567 0006", paymentStatus: "paid", enrollDate: "2024-02-14" },
    { id: "30", firstName: "Jahongir", lastName: "Xolmatov", phone: "+998 90 567 0007", paymentStatus: "paid", enrollDate: "2024-02-16" },
    { id: "31", firstName: "Sevinch", lastName: "Qodirova", phone: "+998 90 567 0008", paymentStatus: "paid", enrollDate: "2024-02-18", attendanceStatus: "no-show", attendedLessons: 0 },
    { id: "32", firstName: "Bekzod", lastName: "Normatov", phone: "+998 90 567 0009", paymentStatus: "paid", enrollDate: "2024-02-20" },
    { id: "33", firstName: "Iroda", lastName: "Sultonova", phone: "+998 90 567 0010", paymentStatus: "paid", enrollDate: "2024-02-22" },
    { id: "34", firstName: "Ulugbek", lastName: "Qodirov", phone: "+998 90 567 0011", paymentStatus: "paid", enrollDate: "2024-02-24" },
    { id: "35", firstName: "Feruza", lastName: "Xasanova", phone: "+998 90 567 0012", paymentStatus: "debt", enrollDate: "2024-02-26" },
    { id: "36", firstName: "Nodir", lastName: "Ashrapov", phone: "+998 90 567 0013", paymentStatus: "paid", enrollDate: "2024-02-28" },
    { id: "37", firstName: "Dilfuza", lastName: "Raxmatova", phone: "+998 90 567 0014", paymentStatus: "paid", enrollDate: "2024-03-01" },
    { id: "38", firstName: "Sanjar", lastName: "Boymurodov", phone: "+998 90 567 0015", paymentStatus: "paid", enrollDate: "2024-03-03" },
  ],
  "4": [
    { id: "7", firstName: "Olivia", lastName: "Brown", phone: "+998 90 123 4507", paymentStatus: "paid", enrollDate: "2024-02-01" },
    { id: "8", firstName: "James", lastName: "Wilson", phone: "+998 90 123 4508", paymentStatus: "paid", enrollDate: "2024-02-05" },
    { id: "10", firstName: "Liam", lastName: "Taylor", phone: "+998 90 123 4510", paymentStatus: "paid", enrollDate: "2024-02-14" },
    { id: "39", firstName: "Ravshan", lastName: "Kamolov", phone: "+998 90 678 0001", paymentStatus: "paid", enrollDate: "2024-02-16" },
    { id: "40", firstName: "Nargiza", lastName: "Abduraxmanova", phone: "+998 90 678 0002", paymentStatus: "debt", enrollDate: "2024-02-18" },
    { id: "41", firstName: "Timur", lastName: "Murodov", phone: "+998 90 678 0003", paymentStatus: "paid", enrollDate: "2024-02-20" },
    { id: "42", firstName: "Sevara", lastName: "Tojiboyeva", phone: "+998 90 678 0004", paymentStatus: "paid", enrollDate: "2024-02-22" },
    { id: "43", firstName: "Firdavs", lastName: "Xoliqov", phone: "+998 90 678 0005", paymentStatus: "paid", enrollDate: "2024-02-25" },
    { id: "44", firstName: "Munira", lastName: "Salimova", phone: "+998 90 678 0006", paymentStatus: "paid", enrollDate: "2024-02-27" },
    { id: "45", firstName: "Abror", lastName: "Yuldashev", phone: "+998 90 678 0007", paymentStatus: "paid", enrollDate: "2024-03-01" },
    { id: "46", firstName: "Lola", lastName: "Raximova", phone: "+998 90 678 0008", paymentStatus: "paid", enrollDate: "2024-03-03" },
    { id: "47", firstName: "Shohrux", lastName: "Tursunov", phone: "+998 90 678 0009", paymentStatus: "paid", enrollDate: "2024-03-05" },
    { id: "48", firstName: "Zilola", lastName: "Ergasheva", phone: "+998 90 678 0010", paymentStatus: "paid", enrollDate: "2024-03-07" },
    { id: "49", firstName: "Bexruz", lastName: "Norqobilov", phone: "+998 90 678 0011", paymentStatus: "paid", enrollDate: "2024-03-09" },
    { id: "50", firstName: "Xurshida", lastName: "Mirzayeva", phone: "+998 90 678 0012", paymentStatus: "debt", enrollDate: "2024-03-11" },
    { id: "51", firstName: "Islom", lastName: "Sobirov", phone: "+998 90 678 0013", paymentStatus: "paid", enrollDate: "2024-03-13" },
    { id: "52", firstName: "Odinaxon", lastName: "Qosimova", phone: "+998 90 678 0014", paymentStatus: "paid", enrollDate: "2024-03-15" },
    { id: "53", firstName: "Dostonbek", lastName: "Rajabov", phone: "+998 90 678 0015", paymentStatus: "paid", enrollDate: "2024-03-17" },
  ],
  "7": [
    { id: "3", firstName: "Emily", lastName: "Davis", phone: "+998 90 123 4503", paymentStatus: "debt", enrollDate: "2024-01-20" },
    { id: "10", firstName: "Liam", lastName: "Taylor", phone: "+998 90 123 4510", paymentStatus: "paid", enrollDate: "2024-02-14" },
    { id: "54", firstName: "Nodira", lastName: "Xolmatova", phone: "+998 90 789 0001", paymentStatus: "paid", enrollDate: "2024-01-22" },
    { id: "55", firstName: "Sherzod", lastName: "Abdullayev", phone: "+998 90 789 0002", paymentStatus: "paid", enrollDate: "2024-01-25" },
    { id: "56", firstName: "Hilola", lastName: "Saidova", phone: "+998 90 789 0003", paymentStatus: "paid", enrollDate: "2024-01-28" },
    { id: "57", firstName: "Mirzo", lastName: "Usmonov", phone: "+998 90 789 0004", paymentStatus: "paid", enrollDate: "2024-02-01" },
    { id: "58", firstName: "Mohinur", lastName: "Raxmatullayeva", phone: "+998 90 789 0005", paymentStatus: "paid", enrollDate: "2024-02-05" },
    { id: "59", firstName: "Akmal", lastName: "Nurmatov", phone: "+998 90 789 0006", paymentStatus: "paid", enrollDate: "2024-02-08" },
    { id: "60", firstName: "Barnoxon", lastName: "Tursunova", phone: "+998 90 789 0007", paymentStatus: "debt", enrollDate: "2024-02-10" },
    { id: "61", firstName: "Eldor", lastName: "Karimov", phone: "+998 90 789 0008", paymentStatus: "paid", enrollDate: "2024-02-12" },
    { id: "62", firstName: "Shahlo", lastName: "Rahimova", phone: "+998 90 789 0009", paymentStatus: "paid", enrollDate: "2024-02-14" },
    { id: "63", firstName: "Oybek", lastName: "Mirzayev", phone: "+998 90 789 0010", paymentStatus: "paid", enrollDate: "2024-02-16" },
  ],
  "9": [
    { id: "8", firstName: "James", lastName: "Wilson", phone: "+998 90 123 4508", paymentStatus: "paid", enrollDate: "2024-03-01" },
    { id: "64", firstName: "Zuhra", lastName: "Abdullaeva", phone: "+998 90 890 0001", paymentStatus: "paid", enrollDate: "2024-03-03" },
    { id: "65", firstName: "Farrux", lastName: "Tojiyev", phone: "+998 90 890 0002", paymentStatus: "paid", enrollDate: "2024-03-05" },
    { id: "66", firstName: "Sabrina", lastName: "Xasanova", phone: "+998 90 890 0003", paymentStatus: "debt", enrollDate: "2024-03-07" },
    { id: "67", firstName: "Mansur", lastName: "Qodirov", phone: "+998 90 890 0004", paymentStatus: "paid", enrollDate: "2024-03-09" },
    { id: "68", firstName: "Gulbahor", lastName: "Normatova", phone: "+998 90 890 0005", paymentStatus: "paid", enrollDate: "2024-03-11" },
    { id: "69", firstName: "Jamshid", lastName: "Raxmonov", phone: "+998 90 890 0006", paymentStatus: "paid", enrollDate: "2024-03-13" },
    { id: "70", firstName: "Nafisa", lastName: "Iskandarova", phone: "+998 90 890 0007", paymentStatus: "paid", enrollDate: "2024-03-15" },
    { id: "71", firstName: "Quvondiq", lastName: "Boymurodov", phone: "+998 90 890 0008", paymentStatus: "paid", enrollDate: "2024-03-17" },
    { id: "72", firstName: "Maftuna", lastName: "Ergasheva", phone: "+998 90 890 0009", paymentStatus: "paid", enrollDate: "2024-03-19" },
    { id: "73", firstName: "Alisher", lastName: "Xolmatov", phone: "+998 90 890 0010", paymentStatus: "paid", enrollDate: "2024-03-21" },
    { id: "74", firstName: "Durdona", lastName: "Qosimova", phone: "+998 90 890 0011", paymentStatus: "paid", enrollDate: "2024-03-23" },
    { id: "75", firstName: "Husan", lastName: "Salimov", phone: "+998 90 890 0012", paymentStatus: "paid", enrollDate: "2024-03-25" },
    { id: "76", firstName: "Laylo", lastName: "Tursunova", phone: "+998 90 890 0013", paymentStatus: "debt", enrollDate: "2024-03-27" },
    { id: "77", firstName: "Sardorbek", lastName: "Yusupov", phone: "+998 90 890 0014", paymentStatus: "paid", enrollDate: "2024-03-29" },
    { id: "78", firstName: "Robiya", lastName: "Ashrapova", phone: "+998 90 890 0015", paymentStatus: "paid", enrollDate: "2024-03-31" },
  ],
  "10": [
    { id: "4", firstName: "Alex", lastName: "Rivera", phone: "+998 90 123 4504", paymentStatus: "paid", enrollDate: "2024-02-10" },
    { id: "6", firstName: "Daniel", lastName: "Kim", phone: "+998 90 123 4506", paymentStatus: "paid", enrollDate: "2024-02-15" },
    { id: "79", firstName: "Sevara", lastName: "Mirzayeva", phone: "+998 90 901 0001", paymentStatus: "paid", enrollDate: "2024-02-18" },
    { id: "80", firstName: "Botir", lastName: "Sultonov", phone: "+998 90 901 0002", paymentStatus: "paid", enrollDate: "2024-02-20" },
    { id: "81", firstName: "Nigora", lastName: "Abduraxmanova", phone: "+998 90 901 0003", paymentStatus: "debt", enrollDate: "2024-02-22" },
    { id: "82", firstName: "Shamsiddin", lastName: "Ergashev", phone: "+998 90 901 0004", paymentStatus: "paid", enrollDate: "2024-02-24" },
    { id: "83", firstName: "Gavhar", lastName: "Xoliqova", phone: "+998 90 901 0005", paymentStatus: "paid", enrollDate: "2024-02-26" },
    { id: "84", firstName: "Tohir", lastName: "Normatov", phone: "+998 90 901 0006", paymentStatus: "paid", enrollDate: "2024-02-28" },
    { id: "85", firstName: "Odina", lastName: "Karimova", phone: "+998 90 901 0007", paymentStatus: "paid", enrollDate: "2024-03-02" },
    { id: "86", firstName: "Jaloliddin", lastName: "Yuldashev", phone: "+998 90 901 0008", paymentStatus: "paid", enrollDate: "2024-03-04" },
  ],
};
