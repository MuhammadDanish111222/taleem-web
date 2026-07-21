export class ResourceError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "VALIDATION_FAILED"
      | "HIERARCHY_MISMATCH"
      | "HIERARCHY_INACTIVE"
      | "INVALID_TRANSITION"
      | "MISSING_VERSION"
      | "UNAUTHORIZED",
    message: string
  ) {
    super(message);
    this.name = "ResourceError";
  }
}
