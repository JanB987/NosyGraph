/**
 * Stable identifiers used at the host-neutral graph boundary.
 *
 * They are aliases for now so the existing string-based engine can adopt them
 * incrementally. Once all construction is centralized, these can become
 * branded types without requiring a large migration.
 */
export type NoteId = string;
export type NodeInstanceId = string;
export type EdgeId = string;
export type LinkTypeId = string;
export type ExpansionId = string;
export type GraphContextId = string;
export type LensId = string;
export type GraphDocumentId = string;
export type BadgeId = string;
