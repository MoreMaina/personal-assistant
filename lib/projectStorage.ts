import { readStoredJson } from "./storageRecovery";

export type ProjectStatus =
  | "Active"
  | "Paused"
  | "Completed";

export type EnergyLevel = "Low" | "Medium" | "High";

export type ContextType =
  | "Anywhere"
  | "Computer"
  | "Quiet"
  | "School"
  | "Home";

export type Project = {
  id: number;
  name: string;
  purpose: string;
  status: ProjectStatus;
  importance: "Low" | "Medium" | "High";
  nextAction: string;
  estimatedMinutes: number;
  energy: EnergyLevel;
  context: ContextType;
  deadline?: string;
  lastWorkedOn?: string;
};

const PROJECTS_KEY = "personal-assistant-projects";

export function getProjects(): Project[] {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = localStorage.getItem(PROJECTS_KEY);
  if (!saved) {
    return [];
  }

  return readStoredJson<Project[]>(
    PROJECTS_KEY,
    saved,
    [],
    (value) =>
      Array.isArray(value) &&
      value.every((item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).id === "number" &&
        typeof (item as Record<string, unknown>).name === "string"
      ),
  );
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(
    PROJECTS_KEY,
    JSON.stringify(projects),
  );
}

export function addProject(
  project: Omit<
    Project,
    "id" | "status" | "lastWorkedOn"
  >,
) {
  const projects = getProjects();

  const newProject: Project = {
    ...project,
    id: Date.now(),
    status: "Active",
  };

  saveProjects([...projects, newProject]);

  return newProject;
}

export function updateProject(project: Project) {
  const projects = getProjects();

  saveProjects(
    projects.map((item) =>
      item.id === project.id ? project : item,
    ),
  );
}

export function deleteProject(id: number) {
  const projects = getProjects();

  saveProjects(
    projects.filter((project) => project.id !== id),
  );
}