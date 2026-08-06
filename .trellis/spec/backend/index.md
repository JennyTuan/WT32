# Backend Development Guidelines

WT32's backend is a FastAPI prototype service backed by SQLAlchemy models and
Pydantic schemas. It simulates console workflows; it is not clinical device
control or a source of diagnostic, dose, or treatment decisions.

## Read in this order

1. [Directory structure](./directory-structure.md)
2. [Database guidelines](./database-guidelines.md)
3. [Error handling](./error-handling.md)
4. [Quality guidelines](./quality-guidelines.md)
5. [Logging guidelines](./logging-guidelines.md)

For CT, dose, contrast, or scan-workflow changes, also read
`docs/CT_DOMAIN_CONTEXT.md`. Preserve the protocol-template versus
scan-session snapshot boundary.
