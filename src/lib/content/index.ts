import type { Course, Lesson, Module } from "./types";
import { VFR_COURSE } from "./vfr";
import { IFR_COURSE } from "./ifr";

export type {
  Course,
  Lesson,
  Module,
  LessonBlock,
  QuizQuestion,
  Flashcard,
  CalloutTone,
} from "./types";
export { VFR_COURSE } from "./vfr";
export { IFR_COURSE } from "./ifr";

export const COURSES: Course[] = [VFR_COURSE, IFR_COURSE];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export function getModule(courseId: string, moduleId: string): Module | undefined {
  return getCourse(courseId)?.modules.find((m) => m.id === moduleId);
}

export function allLessons(
  courseId?: string,
): { course: Course; module: Module; lesson: Lesson }[] {
  const courses = courseId === undefined ? COURSES : COURSES.filter((c) => c.id === courseId);
  const out: { course: Course; module: Module; lesson: Lesson }[] = [];
  for (const course of courses) {
    for (const module of course.modules) {
      for (const lesson of module.lessons) {
        out.push({ course, module, lesson });
      }
    }
  }
  return out;
}

export function lessonCount(courseId?: string): number {
  return allLessons(courseId).length;
}

export function moduleLink(courseId: string, moduleId: string): string {
  return `/academy/${courseId}/${moduleId}`;
}
