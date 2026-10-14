import { Suspense } from "react";
import { redirect } from "next/navigation";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ProjectsRedirect({
  searchParams,
}: ProjectsPageProps) {
  const supplied = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "projects");

  for (const [key, value] of Object.entries(supplied)) {
    if (key === "tab") continue;

    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    }
  }

  redirect(`/reading?${params.toString()}`);
  return null;
}

export default function ProjectsPage(props: ProjectsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center p-6">
          <p className="font-bold text-[var(--ink-soft)]" role="status">
            Opening Workspace…
          </p>
        </main>
      }
    >
      <ProjectsRedirect searchParams={props.searchParams} />
    </Suspense>
  );
}
