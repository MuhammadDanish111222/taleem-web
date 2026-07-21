import { z } from "zod";

// Base Identifier schemas
const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric and dashes only");

const boardIdSchema = z.object({ boardId: slugSchema }).strict();
const classIdSchema = boardIdSchema.extend({ classId: slugSchema }).strict();
const subjectIdSchema = classIdSchema.extend({ subjectId: slugSchema }).strict();
const chapterIdSchema = subjectIdSchema.extend({ chapterId: slugSchema }).strict();

// CREATE
const createBoardSchema = boardIdSchema.extend({
  operation: z.literal("create"),
  level: z.literal("board"),
  name: z.string().min(1).max(100),
}).strict();

const createClassSchema = classIdSchema.extend({
  operation: z.literal("create"),
  level: z.literal("class"),
  name: z.string().min(1).max(100),
}).strict();

const createSubjectSchema = subjectIdSchema.extend({
  operation: z.literal("create"),
  level: z.literal("subject"),
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
}).strict();

const createChapterSchema = chapterIdSchema.extend({
  operation: z.literal("create"),
  level: z.literal("chapter"),
  title: z.string().min(1).max(150),
  chapter_number: z.number().int().positive(),
}).strict();

// UPDATE (Slug is immutable identifier, only descriptive fields change)
const updateBoardSchema = boardIdSchema.extend({
  operation: z.literal("update"),
  level: z.literal("board"),
  name: z.string().min(1).max(100),
}).strict();

const updateClassSchema = classIdSchema.extend({
  operation: z.literal("update"),
  level: z.literal("class"),
  name: z.string().min(1).max(100),
}).strict();

const updateSubjectSchema = subjectIdSchema.extend({
  operation: z.literal("update"),
  level: z.literal("subject"),
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
}).strict();

const updateChapterSchema = chapterIdSchema.extend({
  operation: z.literal("update"),
  level: z.literal("chapter"),
  title: z.string().min(1).max(150),
  chapter_number: z.number().int().positive(),
}).strict();

// TOGGLE
const toggleBoardSchema = boardIdSchema.extend({
  operation: z.literal("toggle"),
  level: z.literal("board"),
  active: z.boolean(),
}).strict();

const toggleClassSchema = classIdSchema.extend({
  operation: z.literal("toggle"),
  level: z.literal("class"),
  active: z.boolean(),
}).strict();

const toggleSubjectSchema = subjectIdSchema.extend({
  operation: z.literal("toggle"),
  level: z.literal("subject"),
  active: z.boolean(),
}).strict();

const toggleChapterSchema = chapterIdSchema.extend({
  operation: z.literal("toggle"),
  level: z.literal("chapter"),
  active: z.boolean(),
}).strict();

// REORDER
const orderedIdsSchema = z.array(slugSchema).min(1).max(200);

const reorderBoardSchema = z.object({
  operation: z.literal("reorder"),
  level: z.literal("board"),
  orderedIds: orderedIdsSchema,
}).strict();

const reorderClassSchema = boardIdSchema.extend({
  operation: z.literal("reorder"),
  level: z.literal("class"),
  orderedIds: orderedIdsSchema,
}).strict();

const reorderSubjectSchema = classIdSchema.extend({
  operation: z.literal("reorder"),
  level: z.literal("subject"),
  orderedIds: orderedIdsSchema,
}).strict();

const reorderChapterSchema = subjectIdSchema.extend({
  operation: z.literal("reorder"),
  level: z.literal("chapter"),
  orderedIds: orderedIdsSchema,
}).strict();

// Discriminated Unions
export const catalogueMutationSchema = z.union([
  // create
  createBoardSchema,
  createClassSchema,
  createSubjectSchema,
  createChapterSchema,
  // update
  updateBoardSchema,
  updateClassSchema,
  updateSubjectSchema,
  updateChapterSchema,
  // toggle
  toggleBoardSchema,
  toggleClassSchema,
  toggleSubjectSchema,
  toggleChapterSchema,
  // reorder
  reorderBoardSchema,
  reorderClassSchema,
  reorderSubjectSchema,
  reorderChapterSchema,
]);

export type CatalogueMutation = z.infer<typeof catalogueMutationSchema>;

export type CreateMutation = 
  | z.infer<typeof createBoardSchema>
  | z.infer<typeof createClassSchema>
  | z.infer<typeof createSubjectSchema>
  | z.infer<typeof createChapterSchema>;

export type UpdateMutation = 
  | z.infer<typeof updateBoardSchema>
  | z.infer<typeof updateClassSchema>
  | z.infer<typeof updateSubjectSchema>
  | z.infer<typeof updateChapterSchema>;

export type ToggleMutation = 
  | z.infer<typeof toggleBoardSchema>
  | z.infer<typeof toggleClassSchema>
  | z.infer<typeof toggleSubjectSchema>
  | z.infer<typeof toggleChapterSchema>;

export type ReorderMutation = 
  | z.infer<typeof reorderBoardSchema>
  | z.infer<typeof reorderClassSchema>
  | z.infer<typeof reorderSubjectSchema>
  | z.infer<typeof reorderChapterSchema>;
