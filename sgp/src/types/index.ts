import type {
  User,
  Project,
  Activity,
  Win,
  Risk,
  Meeting,
  ProjectStatus,
  ActivityStatus,
  WinStatus,
  RiskLevel,
  RiskStatus,
  UserRole,
} from "@prisma/client";

export type {
  User,
  Project,
  Activity,
  Win,
  Risk,
  Meeting,
  ProjectStatus,
  ActivityStatus,
  WinStatus,
  RiskLevel,
  RiskStatus,
  UserRole,
};

export interface ProjectWithRelations extends Project {
  members: { user: User }[];
  activities: Activity[];
}

export interface KpiSummary {
  totalProjects: number;
  activeProjects: number;
  overdueActivities: number;
  openRisks: number;
}
