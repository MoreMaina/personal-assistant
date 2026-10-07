export type ReviewRating = "Hard" | "Okay" | "Easy";

export type Program = {
  id: number;
  name: string;
};

export type Semester = {
  id: number;
  programId: number;
  name: string;
};

export type Course = {
  id: number;
  semesterId: number;
  name: string;
  code?: string;
};

export type Unit = {
  id: number;
  courseId: number;
  name: string;
};

export type Lecture = {
  id: number;
  unitId: number;
  name: string;
  prompt: string;
  answer: string;
  reviewCount: number;
  intervalDays: number;
  nextReviewAt: string;
  lastReviewedAt?: string;
};

type StudyData = {
  programs: Program[];
  semesters: Semester[];
  courses: Course[];
  units: Unit[];
  lectures: Lecture[];
};

const STORAGE_KEY = "personal-assistant-study-v2";
const CURRENT_SEMESTER_KEY =
  "personal-assistant-current-semester";

function getEmptyStudyData(): StudyData {
  return {
    programs: [],
    semesters: [],
    courses: [],
    units: [],
    lectures: [],
  };
}

export function getStudyData(): StudyData {
  if (typeof window === "undefined") {
    return getEmptyStudyData();
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return getEmptyStudyData();
  }

  try {
    return JSON.parse(saved);
  } catch {
    return getEmptyStudyData();
  }
}

export function saveStudyData(data: StudyData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getPrograms() {
  return getStudyData().programs;
}

export function getSemesters() {
  return getStudyData().semesters;
}

export function getCourses() {
  return getStudyData().courses;
}

export function getUnits() {
  return getStudyData().units;
}

export function getLectures() {
  return getStudyData().lectures;
}

export function addProgram(name: string) {
  const data = getStudyData();

  const program: Program = {
    id: Date.now(),
    name: name.trim(),
  };

  saveStudyData({
    ...data,
    programs: [...data.programs, program],
  });

  return program;
}

export function addSemester(
  programId: number,
  name: string,
) {
  const data = getStudyData();

  const semester: Semester = {
    id: Date.now(),
    programId,
    name: name.trim(),
  };

  saveStudyData({
    ...data,
    semesters: [...data.semesters, semester],
  });

  setCurrentSemesterId(semester.id);

  return semester;
}

export function addCourse(
  semesterId: number,
  name: string,
  code?: string,
) {
  const data = getStudyData();

  const course: Course = {
    id: Date.now(),
    semesterId,
    name: name.trim(),
    code: code?.trim() || undefined,
  };

  saveStudyData({
    ...data,
    courses: [...data.courses, course],
  });

  return course;
}

export function addCoursesBulk(
  semesterId: number,
  names: string[],
) {
  const data = getStudyData();

  const cleanNames = names
    .map((name) => name.trim())
    .filter(Boolean);

  const baseId = Date.now();

  const newCourses: Course[] = cleanNames.map(
    (name, index) => ({
      id: baseId + index,
      semesterId,
      name,
    }),
  );

  saveStudyData({
    ...data,
    courses: [...data.courses, ...newCourses],
  });

  return newCourses;
}

export function addUnit(
  courseId: number,
  name: string,
) {
  const data = getStudyData();

  const unit: Unit = {
    id: Date.now(),
    courseId,
    name: name.trim(),
  };

  saveStudyData({
    ...data,
    units: [...data.units, unit],
  });

  return unit;
}

export function addUnitsBulk(
  courseId: number,
  names: string[],
) {
  const data = getStudyData();

  const cleanNames = names
    .map((name) => name.trim())
    .filter(Boolean);

  const baseId = Date.now();

  const newUnits: Unit[] = cleanNames.map(
    (name, index) => ({
      id: baseId + index,
      courseId,
      name,
    }),
  );

  saveStudyData({
    ...data,
    units: [...data.units, ...newUnits],
  });

  return newUnits;
}

export function addLecture(
  unitId: number,
  name: string,
  prompt: string,
  answer: string,
) {
  const data = getStudyData();

  const lecture: Lecture = {
    id: Date.now(),
    unitId,
    name: name.trim(),
    prompt: prompt.trim(),
    answer: answer.trim(),
    reviewCount: 0,
    intervalDays: 0,
    nextReviewAt: new Date().toISOString(),
  };

  saveStudyData({
    ...data,
    lectures: [...data.lectures, lecture],
  });

  return lecture;
}

export function updateLecture(updatedLecture: Lecture) {
  const data = getStudyData();

  saveStudyData({
    ...data,
    lectures: data.lectures.map((lecture) =>
      lecture.id === updatedLecture.id
        ? updatedLecture
        : lecture,
    ),
  });
}

export function getCurrentSemesterId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = localStorage.getItem(
    CURRENT_SEMESTER_KEY,
  );

  if (!saved) {
    return null;
  }

  const id = Number(saved);

  return Number.isFinite(id) ? id : null;
}

export function setCurrentSemesterId(
  semesterId: number,
) {
  localStorage.setItem(
    CURRENT_SEMESTER_KEY,
    String(semesterId),
  );
}

export function getCurrentSemester() {
  const currentSemesterId =
    getCurrentSemesterId();

  if (currentSemesterId === null) {
    return null;
  }

  return (
    getStudyData().semesters.find(
      (semester) =>
        semester.id === currentSemesterId,
    ) ?? null
  );
}

export function scheduleReview(
  lecture: Lecture,
  rating: ReviewRating,
) {
  const now = new Date();

  let intervalDays: number;

  if (rating === "Hard") {
    if (lecture.reviewCount === 0) {
      intervalDays = 1;
    } else {
      intervalDays = Math.max(
        1,
        Math.round(lecture.intervalDays * 0.5),
      );
    }
  } else if (rating === "Okay") {
    if (lecture.reviewCount === 0) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(
        3,
        Math.round(lecture.intervalDays * 1.8),
      );
    }
  } else {
    if (lecture.reviewCount === 0) {
      intervalDays = 7;
    } else {
      intervalDays = Math.max(
        7,
        Math.round(lecture.intervalDays * 2.5),
      );
    }
  }

  intervalDays = Math.min(intervalDays, 120);

  const nextReview = new Date(
    now.getTime() +
      intervalDays * 24 * 60 * 60 * 1000,
  );

  const updatedLecture: Lecture = {
    ...lecture,
    reviewCount: lecture.reviewCount + 1,
    intervalDays,
    nextReviewAt: nextReview.toISOString(),
    lastReviewedAt: now.toISOString(),
  };

  updateLecture(updatedLecture);

  return updatedLecture;
}
export function updateCourse(
  courseId: number,
  updates: Partial<Pick<Course, "name" | "code">>,
) {
  const data = getStudyData();

  const updatedCourses = data.courses.map((course) =>
    course.id === courseId
      ? {
          ...course,
          ...updates,
          name: updates.name?.trim() ?? course.name,
          code:
            updates.code === undefined
              ? course.code
              : updates.code.trim() || undefined,
        }
      : course,
  );

  saveStudyData({
    ...data,
    courses: updatedCourses,
  });
}

export function deleteCourse(courseId: number) {
  const data = getStudyData();

  const unitIds = data.units
    .filter((unit) => unit.courseId === courseId)
    .map((unit) => unit.id);

  saveStudyData({
    ...data,
    courses: data.courses.filter(
      (course) => course.id !== courseId,
    ),
    units: data.units.filter(
      (unit) => unit.courseId !== courseId,
    ),
    lectures: data.lectures.filter(
      (lecture) => !unitIds.includes(lecture.unitId),
    ),
  });
}

export function updateUnit(
  unitId: number,
  updates: Pick<Unit, "name">,
) {
  const data = getStudyData();

  const updatedUnits = data.units.map((unit) =>
    unit.id === unitId
      ? {
          ...unit,
          name: updates.name.trim(),
        }
      : unit,
  );

  saveStudyData({
    ...data,
    units: updatedUnits,
  });
}

export function deleteUnit(unitId: number) {
  const data = getStudyData();

  saveStudyData({
    ...data,
    units: data.units.filter(
      (unit) => unit.id !== unitId,
    ),
    lectures: data.lectures.filter(
      (lecture) => lecture.unitId !== unitId,
    ),
  });
}

export function deleteLecture(lectureId: number) {
  const data = getStudyData();

  saveStudyData({
    ...data,
    lectures: data.lectures.filter(
      (lecture) => lecture.id !== lectureId,
    ),
  });
}