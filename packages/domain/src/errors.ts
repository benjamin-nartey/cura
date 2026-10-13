export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = "forbidden", message = "You cannot do that with this role.") {
    super(code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That record is not on this facility.") {
    super("notfound", message);
  }
}

export class ConflictError extends AppError {
  constructor(code: "conflict" | "duplicate" | "open", message: string) {
    super(code, message);
  }
}

export class ValidationError extends AppError {
  constructor(code: "invalid" | "range" | "code" = "invalid", message = "Check the form and try again.") {
    super(code, message);
  }
}
