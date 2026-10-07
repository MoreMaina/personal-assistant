export type ReviewRating = "Again" | "Good" | "Easy";

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
  box: number;
  reviewCount: number;
  nextReviewAt: string;
  lastReviewedAt?: string;
  lastRating?: ReviewRating;
};

type StudyData = {
  programs: Program[];
  semesters: Semester[];
  courses: Course[];
  units: Unit[];
  lectures: Lecture[];
};

type StoredLecture = Partial<Lecture> & {
  intervalDays?: number;
  prompt?: string;
  answer?: string;
};

const STORAGE_KEY = "personal-assistant-study-v2";
const CURRENT_SEMESTER_KEY =
  "personal-assistant-current-semester";

const BOX_INTERVALS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

function getEmptyStudyData(): StudyData {
  return {
    programs: [],
    semesters: [],
    courses: [],
    units: [],
    lectures: [],
  };
}

function clampBox(box: number) {
  return Math.min(5, Math.max(1, box));
}

function inferBoxFromLegacyInterval(intervalDays: number) {
  if (intervalDays <= 1) {
    return 1;
  }

  if (intervalDays <= 3) {
    return 2;
  }

  if (intervalDays <= 7) {
    return 3;
  }

  if (intervalDays <= 14) {
    return 4;
  }

  return 5;
}

function normalizeLecture(
  lecture: StoredLecture,
): Lecture | null {
  if (
    typeof lecture.id !== "number" ||
    typeof lecture.unitId !== "number" ||
    typeof lecture.name !== "string"
  ) {
    return null;
  }

  const legacyInterval =
    typeof lecture.intervalDays === "number"
      ? lecture.intervalDays
      : 0;

  const box =
    typeof lecture.box === "number"
      ? clampBox(lecture.box)
      : inferBoxFromLegacyInterval(legacyInterval);

  const reviewCount =
    typeof lecture.reviewCount === "number"
      ? Math.max(0, lecture.reviewCount)
      : 0;

  const nextReviewAt =
    typeof lecture.nextReviewAt === "string"
      ? lecture.nextReviewAt
      : new Date().toISOString();

  return {
    id: lecture.id,
    unitId: lecture.unitId,
    name: lecture.name.trim(),
    box,
    reviewCount,
    nextReviewAt,
    lastReviewedAt:
      typeof lecture.lastReviewedAt === "string"
        ? lecture.lastReviewedAt
        : undefined,
    lastRating:
      lecture.lastRating === "Again" ||
      lecture.lastRating === "Good" ||
      lecture.lastRating === "Easy"
        ? lecture.lastRating
        : undefined,
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
    const parsed = JSON.parse(saved) as {
      programs?: Program[];
      semesters?: Semester[];
      courses?: Course[];
      units?: Unit[];
      lectures?: StoredLecture[];
    };

    return {
      programs: Array.isArray(parsed.programs)
        ? parsed.programs
        : [],
      semesters: Array.isArray(parsed.semesters)
        ? parsed.semesters
        : [],
      courses: Array.isArray(parsed.courses)
        ? parsed.courses
        : [],
      units: Array.isArray(parsed.units)
        ? parsed.units
        : [],
      lectures: Array.isArray(parsed.lectures)
        ? parsed.lectures
            .map(normalizeLecture)
            .filter(
              (lecture): lecture is Lecture =>
                lecture !== null,
            )
        : [],
    };
  } catch {
    return getEmptyStudyData();
  }
}

export function saveStudyData(data: StudyData) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data),
  );
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
  const cleanName = name.trim();

  if (!cleanName) {
    return null;
  }

  const data = getStudyData();

  const program: Program = {
    id: Date.now(),
    name: cleanName,
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
  const cleanName = name.trim();

  if (!cleanName) {
    return null;
  }

  const data = getStudyData();

  const semester: Semester = {
    id: Date.now(),
    programId,
    name: cleanName,
  };

  saveStudyData({
    ...data,
    semesters: [...data.semesters, semester],
  });

  setCurrentSemesterId(semester.id);

  return semester;
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

export function addCourse(
  semesterId: number,
  name: string,
  code?: string,
) {
  const cleanName = name.trim();

  if (!cleanName) {
    return null;
  }

  const data = getStudyData();

  const course: Course = {
    id: Date.now(),
    semesterId,
    name: cleanName,
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
          name:
            updates.name !== undefined
              ? updates.name.trim()
              : course.name,
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

export function addUnit(
  courseId: number,
  name: string,
) {
  const cleanName = name.trim();

  if (!cleanName) {
    return null;
  }

  const data = getStudyData();

  const unit: Unit = {
    id: Date.now(),
    courseId,
    name: cleanName,
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

export function addLecture(
  unitId: number,
  name: string,
) {
  const cleanName = name.trim();

  if (!cleanName) {
    return null;
  }

  const data = getStudyData();

  const lecture: Lecture = {
    id: Date.now(),
    unitId,
    name: cleanName,
    box: 1,
    reviewCount: 0,
    nextReviewAt: new Date().toISOString(),
  };

  saveStudyData({
    ...data,
    lectures: [...data.lectures, lecture],
  });

  return lecture;
}

export function addLecturesBulk(
  unitId: number,
  names: string[],
) {
  const data = getStudyData();

  const cleanNames = names
    .map((name) => name.trim())
    .filter(Boolean);

  const baseId = Date.now();

  const newLectures: Lecture[] = cleanNames.map(
    (name, index) => ({
      id: baseId + index,
      unitId,
      name,
      box: 1,
      reviewCount: 0,
      nextReviewAt: new Date().toISOString(),
    }),
  );

  saveStudyData({
    ...data,
    lectures: [...data.lectures, ...newLectures],
  });

  return newLectures;
}

export function updateLecture(
  lectureId: number,
  updates: Partial<Pick<Lecture, "name">>,
) {
  const data = getStudyData();

  const updatedLectures = data.lectures.map(
    (lecture) =>
      lecture.id === lectureId
        ? {
            ...lecture,
            ...updates,
            name:
              updates.name !== undefined
                ? updates.name.trim()
                : lecture.name,
          }
        : lecture,
  );

  saveStudyData({
    ...data,
    lectures: updatedLectures,
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

export function getReviewIntervalDays(
  box: number,
) {
  return BOX_INTERVALS[clampBox(box)] ?? 1;
}

export function getDueLectures(
  semesterId?: number,
) {
  const data = getStudyData();
  const now = Date.now();

  const semesterCourseIds = semesterId
    ? new Set(
        data.courses
          .filter(
            (course) =>
              course.semesterId === semesterId,
          )
          .map((course) => course.id),
      )
    : null;

  const semesterUnitIds = semesterCourseIds
    ? new Set(
        data.units
          .filter((unit) =>
            semesterCourseIds.has(unit.courseId),
          )
          .map((unit) => unit.id),
      )
    : null;

  return data.lectures.filter((lecture) => {
    if (
      semesterUnitIds &&
      !semesterUnitIds.has(lecture.unitId)
    ) {
      return false;
    }

    return (
      new Date(lecture.nextReviewAt).getTime() <= now
    );
  });
}

export function scheduleReview(
  lecture: Lecture,
  rating: ReviewRating,
) {
  const now = new Date();

  let nextBox: number;

  if (rating === "Again") {
    nextBox = Math.max(1, lecture.box - 1);
  } else if (rating === "Good") {
    nextBox = Math.min(5, lecture.box + 1);
  } else {
    nextBox = Math.min(5, lecture.box + 2);
  }

  const intervalDays =
    getReviewIntervalDays(nextBox);

  const nextReview = new Date(
    now.getTime() +
      intervalDays *
        24 *
        60 *
        60 *
        1000,
  );

  const updatedLecture: Lecture = {
    ...lecture,
    box: nextBox,
    reviewCount: lecture.reviewCount + 1,
    nextReviewAt: nextReview.toISOString(),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
  };

  updateLectureRecord(updatedLecture);

  return updatedLecture;
}

function updateLectureRecord(
  updatedLecture: Lecture,
) {
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