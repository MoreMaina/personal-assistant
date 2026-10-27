export type GoogleCalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  allDay: boolean;
  location?: string;
  description?: string;
  htmlLink?: string;
};
