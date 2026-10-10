
"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import Button from "@/app/components/Button";
import CardMenu from "@/app/components/CardMenu";

import {
  addProject,
  deleteProject,
  ContextType,
  EnergyLevel,
  getProjects,
  Project,
  updateProject,
} from "@/lib/projectStorage";

const energyLevels: EnergyLevel[] = [
  "Low",
  "Medium",
  "High",
];

const contexts: ContextType[] = [
  "Anywhere",
  "Computer",
  "Quiet",
  "School",
  "Home",
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");

  const [importance, setImportance] =
    useState<"Low" | "Medium" | "High">("Medium");

  const [energy, setEnergy] =
    useState<EnergyLevel>("Medium");

  const [context, setContext] =
    useState<ContextType>("Anywhere");

  const [deadline, setDeadline] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const [projectToDelete, setProjectToDelete] =
    useState<Project | null>(null);

  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [highlightedProjectId, setHighlightedProjectId] =
    useState<number | null>(null);

  const [launchHandled, setLaunchHandled] = useState(false);

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  useEffect(() => {
    if (launchHandled || projects.length === 0) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const projectIdValue = params.get("projectId");

    if (!projectIdValue) {
      setLaunchHandled(true);
      return;
    }

    const projectId = Number(projectIdValue);

    if (!Number.isFinite(projectId)) {
      setLaunchHandled(true);
      return;
    }

    const project = projects.find((item) => item.id === projectId);

    if (!project) {
      setLaunchHandled(true);
      return;
    }

    setHighlightedProjectId(project.id);

    window.history.replaceState({}, "", "/projects");

    window.setTimeout(() => {
      document
        .getElementById(`project-${project.id}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 0);

    setLaunchHandled(true);
  }, [launchHandled, projects]);

  function resetForm() {
    setName("");
    setPurpose("");
    setNextAction("");
    setEstimatedMinutes("30");
    setImportance("Medium");
    setEnergy("Medium");
    setContext("Anywhere");
    setDeadline("");
    setFormError("");
    setShowForm(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    if (!name.trim() || !purpose.trim() || !nextAction.trim()) {
      setFormError("Please complete the project name, purpose, and next action.");
      return;
    }

    const minutes = Number(estimatedMinutes);

    if (!Number.isFinite(minutes) || minutes < 1) {
      setFormError("Estimated time must be at least one minute.");
      return;
    }

    try {
      const project = addProject({
        name: name.trim(),
        purpose: purpose.trim(),
        nextAction: nextAction.trim(),
        estimatedMinutes: minutes,
        importance,
        energy,
        context,
        deadline: deadline || undefined,
      });

      setProjects((current) => [...current, project]);
      resetForm();

      setNotice(
        "Project added. Cloud sync will carry the change to your other devices.",
      );
    } catch (error) {
      console.error("Could not save project:", error);
      setFormError("The project could not be saved. Please try again.");
    }
  }

  function markWorkedOn(project: Project) {
    const updated: Project = {
      ...project,
      lastWorkedOn: new Date().toISOString(),
    };

    updateProject(updated);

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id ? updated : item,
      ),
    );

    setNotice("Work session recorded.");
  }

  function completeProject(project: Project) {
    const updated: Project = {
      ...project,
      status: "Completed",
      lastWorkedOn: new Date().toISOString(),
    };

    updateProject(updated);

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id ? updated : item,
      ),
    );

    setNotice(`${project.name} marked as completed.`);
  }

  function reopenProject(project: Project) {
    const updated: Project = {
      ...project,
      status: "Active",
    };

    updateProject(updated);

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id ? updated : item,
      ),
    );

    setNotice(`${project.name} reopened.`);
  }

  function askToDelete(project: Project) {
    setDeleteError("");
    setProjectToDelete(project);
  }

  function confirmDelete() {
    if (!projectToDelete || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const deletedName = projectToDelete.name;

      // Save the removal to localStorage. The existing CloudSync
      // component will detect the change and send it to Supabase.
      deleteProject(projectToDelete.id);

      setProjects((current) =>
        current.filter((item) => item.id !== projectToDelete.id),
      );

      if (highlightedProjectId === projectToDelete.id) {
        setHighlightedProjectId(null);
      }

      setProjectToDelete(null);

      setNotice(
        `${deletedName} deleted. Cloud sync will send this change to your other devices.`,
      );
    } catch (error) {
      console.error("Could not delete project:", error);
      setDeleteError(
        "The project could not be deleted. Your saved list has not been intentionally changed.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const activeProjects = projects.filter(
    (project) => project.status === "Active",
  );

  const completedProjects = projects.filter(
    (project) => project.status === "Completed",
  );

  function formatDeadline(value: string) {
    return new Date(`${value}T00:00:00`).toLocaleDateString(
      "en-KE",
      {
        month: "short",
        day: "numeric",
      },
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header className="mb-8">
          <p className="stat-label">
            Things you want to move forward
          </p>

          <h1 className="mt-2 text-4xl sm:text-5xl">
            Projects
          </h1>

          <p className="mt-3 text-[var(--ink-soft)]">
            Keep the big picture separate from the individual things you need to do.
          </p>
        </header>

        {notice && (
          <div
            role="status"
            className="mb-5 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-4 font-extrabold text-[var(--primary-dark)]"
          >
            {notice}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl">Active projects</h2>
            <p className="mt-1 text-sm font-bold text-[var(--muted)]">
              {activeProjects.length} active
            </p>
          </div>

          <Button
            variant="primary"
            onClick={() => {
              setNotice("");
              setFormError("");
              setShowForm(true);
            }}
          >
            + Add project
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="card mb-6 space-y-5 bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl">Add a project</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Start with a clear goal and one doable next action.
                </p>
              </div>

              <Button
                variant="icon"
                aria-label="Close project form"
                title="Close"
                onClick={resetForm}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m18 6-12 12M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-extrabold">
                  Project name
                </label>
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Build my website"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-extrabold">
                  What is this project for?
                </label>
                <textarea
                  required
                  rows={3}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="A brief description of what you're trying to accomplish."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-extrabold">
                  Next action
                </label>
                <input
                  required
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                  placeholder="e.g. Write the homepage introduction"
                />
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Make this something you can actually do, not another vague goal.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-extrabold">
                    Estimated time (minutes)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={estimatedMinutes}
                    onChange={(event) =>
                      setEstimatedMinutes(event.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-extrabold">
                    Importance
                  </label>
                  <select
                    value={importance}
                    onChange={(event) =>
                      setImportance(
                        event.target.value as "Low" | "Medium" | "High",
                      )
                    }
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-extrabold">
                    Energy required
                  </label>
                  <select
                    value={energy}
                    onChange={(event) =>
                      setEnergy(event.target.value as EnergyLevel)
                    }
                  >
                    {energyLevels.map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-extrabold">
                    Best context
                  </label>
                  <select
                    value={context}
                    onChange={(event) =>
                      setContext(event.target.value as ContextType)
                    }
                  >
                    {contexts.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-extrabold">
                    Deadline (optional)
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-xl bg-[var(--accent-soft)] p-3 font-extrabold text-[var(--accent-dark)]"
              >
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={resetForm}
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                type="submit"
                className="w-full sm:w-auto"
              >
                Save project
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {activeProjects.length === 0 ? (
            <section className="card bg-[var(--surface)] p-8 text-center">
              <h2 className="text-2xl">Nothing in progress yet</h2>
              <p className="mt-2 text-[var(--ink-soft)]">
                Add a project and give it a concrete next action.
              </p>
              {!showForm && (
                <Button
                  variant="primary"
                  className="mt-5"
                  onClick={() => setShowForm(true)}
                >
                  Create your first project
                </Button>
              )}
            </section>
          ) : (
            activeProjects.map((project) => {
              const highlighted =
                highlightedProjectId === project.id;

              return (
                <article
                  key={project.id}
                  id={`project-${project.id}`}
                  className={`card bg-[var(--surface)] p-5 sm:p-6 ${
                    highlighted
                      ? "ring-2 ring-[var(--accent)]"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {highlighted && (
                        <div className="mb-3 inline-flex rounded-full border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] px-3 py-1 text-xs font-extrabold text-[var(--primary-dark)]">
                          Recommended for right now
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-2xl">
                          {project.name}
                        </h2>

                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-extrabold text-[var(--primary)]">
                          {project.importance} importance
                        </span>
                      </div>

                      <p className="mt-2 text-[var(--ink-soft)]">
                        {project.purpose}
                      </p>
                    </div>

                    <CardMenu
                      title={`Actions for ${project.name}`}
                      actions={[
                        {
                          label: "Delete project",
                          destructive: true,
                          onSelect: () => askToDelete(project),
                        },
                      ]}
                    />
                  </div>

                  <div className="mt-5 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary-dark)]">
                      Next action
                    </p>

                    <p className="mt-2 font-extrabold text-[var(--ink)]">
                      {project.nextAction}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold">
                        {project.estimatedMinutes} min
                      </span>

                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold">
                        {project.energy} energy
                      </span>

                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold">
                        {project.context}
                      </span>

                      {project.deadline && (
                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold">
                          Due {formatDeadline(project.deadline)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="primary"
                      className="w-full sm:w-auto"
                      onClick={() => markWorkedOn(project)}
                    >
                      I worked on this
                    </Button>

                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => completeProject(project)}
                    >
                      Complete project
                    </Button>
                  </div>

                  {project.lastWorkedOn && (
                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Last worked on{" "}
                      {new Date(project.lastWorkedOn).toLocaleString()}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>

        {completedProjects.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl">Completed</h2>

            <div className="space-y-3">
              {completedProjects.map((project) => (
                <article
                  key={project.id}
                  className="card flex items-center justify-between gap-3 bg-[var(--surface)] p-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-extrabold text-[var(--primary)]">
                      {project.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      Project completed
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => reopenProject(project)}
                    >
                      Reopen
                    </Button>

                    <CardMenu
                      title={`Actions for ${project.name}`}
                      actions={[
                        {
                          label: "Delete project",
                          destructive: true,
                          onSelect: () => askToDelete(project),
                        },
                      ]}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {projectToDelete && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !deleting
            ) {
              setProjectToDelete(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="w-full max-w-md rounded-[24px] border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-6 shadow-[0_5px_0_var(--primary-dark)]"
          >
            <p className="text-sm font-extrabold uppercase tracking-wide text-[#c0392b]">
              Please confirm
            </p>

            <h2
              id="delete-project-title"
              className="mt-2 break-words text-2xl"
            >
              Delete {projectToDelete.name}?
            </h2>

            <p className="mt-3 text-[var(--ink-soft)]">
              This will remove the project from your list and sync
              the deletion to your other devices. Your previous
              cloud data should remain available in backup history
              after synchronization completes.
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-[var(--accent-soft)] p-3 font-extrabold text-[var(--accent-dark)]"
              >
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </Button>

              <Button
                variant="destructive"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
