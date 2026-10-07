"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addProject,
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
  const [estimatedMinutes, setEstimatedMinutes] =
    useState("30");
  const [importance, setImportance] = useState<
    "Low" | "Medium" | "High"
  >("Medium");
  const [energy, setEnergy] =
    useState<EnergyLevel>("Medium");
  const [context, setContext] =
    useState<ContextType>("Anywhere");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !name.trim() ||
      !purpose.trim() ||
      !nextAction.trim()
    ) {
      return;
    }

    const minutes = Number(estimatedMinutes);

    if (!minutes || minutes < 1) {
      return;
    }

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

    setName("");
    setPurpose("");
    setNextAction("");
    setEstimatedMinutes("30");
    setImportance("Medium");
    setEnergy("Medium");
    setContext("Anywhere");
    setDeadline("");
    setShowForm(false);
  };

  const markWorkedOn = (project: Project) => {
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
  };

  const completeProject = (project: Project) => {
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
  };

  const reopenProject = (project: Project) => {
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
  };

  const activeProjects = projects.filter(
    (project) => project.status === "Active",
  );

  const completedProjects = projects.filter(
    (project) => project.status === "Completed",
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header className="mb-8">
          <p className="text-sm font-medium text-slate-500">
            Things you want to move forward
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Projects
          </h1>

          <p className="mt-2 text-slate-600">
            Keep the big picture separate from the individual
            things you need to do.
          </p>
        </header>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Active projects
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {activeProjects.length} active
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            + Add project
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
          >
            <h2 className="text-lg font-semibold">
              Add a project
            </h2>

            <div className="mt-5 space-y-5">
              <div>
                <label className="text-sm font-medium">
                  Project name
                </label>

                <input
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="e.g. Build my website"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  What is this project for?
                </label>

                <textarea
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value)
                  }
                  placeholder="A brief description of what you're trying to accomplish."
                  className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Next action
                </label>

                <input
                  value={nextAction}
                  onChange={(event) =>
                    setNextAction(event.target.value)
                  }
                  placeholder="e.g. Write the homepage introduction"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Make this something you can actually do, not
                  another vague project goal.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">
                    Estimated time
                  </label>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={estimatedMinutes}
                      onChange={(event) =>
                        setEstimatedMinutes(
                          event.target.value,
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    />

                    <span className="text-sm text-slate-500">
                      minutes
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Importance
                  </label>

                  <select
                    value={importance}
                    onChange={(event) =>
                      setImportance(
                        event.target.value as
                          | "Low"
                          | "Medium"
                          | "High",
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Energy required
                  </label>

                  <select
                    value={energy}
                    onChange={(event) =>
                      setEnergy(
                        event.target.value as EnergyLevel,
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    {energyLevels.map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Best context
                  </label>

                  <select
                    value={context}
                    onChange={(event) =>
                      setContext(
                        event.target.value as ContextType,
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    {contexts.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">
                    Deadline (optional)
                  </label>

                  <input
                    type="date"
                    value={deadline}
                    onChange={(event) =>
                      setDeadline(event.target.value)
                    }
                    className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
              >
                Add project
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {activeProjects.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
              <p className="font-medium">
                No active projects yet.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Add one and give it a concrete next action.
              </p>
            </div>
          ) : (
            activeProjects.map((project) => (
              <article
                key={project.id}
                className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">
                          {project.name}
                        </h2>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                          {project.importance} importance
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {project.purpose}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Next action
                    </p>

                    <p className="mt-2 font-medium">
                      {project.nextAction}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">
                        {project.estimatedMinutes} min
                      </span>

                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">
                        {project.energy} energy
                      </span>

                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">
                        {project.context}
                      </span>

                      {project.deadline && (
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">
                          Due{" "}
                          {new Date(
                            `${project.deadline}T00:00:00`,
                          ).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() =>
                        markWorkedOn(project)
                      }
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      I worked on this
                    </button>

                    <button
                      onClick={() =>
                        completeProject(project)
                      }
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                    >
                      Complete project
                    </button>
                  </div>

                  {project.lastWorkedOn && (
                    <p className="text-xs text-slate-400">
                      Last worked on{" "}
                      {new Date(
                        project.lastWorkedOn,
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {completedProjects.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">
              Completed
            </h2>

            <div className="space-y-3">
              {completedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                >
                  <div>
                    <p className="font-medium">
                      {project.name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Project completed
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      reopenProject(project)
                    }
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                  >
                    Reopen
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}