export type ClassItem = {
  id: number;
  name: string;
  type: string;
  day: string;
  start: string;
  end: string;
};

export const classes: ClassItem[] = [
  {
    id: 1,
    name: "Economics",
    type: "Lecture",
    day: "Monday",
    start: "10:00",
    end: "11:00",
  },
  {
    id: 2,
    name: "Mathematics",
    type: "Lecture",
    day: "Tuesday",
    start: "13:00",
    end: "14:00",
  },
  {
    id: 3,
    name: "Computer Science",
    type: "Practical",
    day: "Wednesday",
    start: "15:30",
    end: "17:00",
  },
];