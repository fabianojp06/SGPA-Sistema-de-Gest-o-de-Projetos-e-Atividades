import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns"
import { ptBR } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string, pattern = "dd/MM/yyyy") {
  const value = typeof date === "string" ? new Date(date) : date
  return format(value, pattern, { locale: ptBR })
}

export function getWeekNumber(date: Date = new Date()) {
  return getISOWeek(date)
}

export function getCurrentWeek() {
  const now = new Date()
  return {
    week: getISOWeek(now),
    year: getISOWeekYear(now),
  }
}

export function getWeekDateRange(date: Date = new Date()) {
  return {
    start: startOfISOWeek(date),
    end: endOfISOWeek(date),
  }
}
