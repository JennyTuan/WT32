# Backend Logging Guidelines

The current service does not define a project-wide structured logging wrapper.
Do not introduce one for a single endpoint. Follow a nearby module if logging
is needed and log only operational context needed to diagnose a simulator or
persistence failure.

Never log passwords, authentication tokens, database URLs, raw DICOM payloads,
or unnecessary patient-identifying data. Keep exception handling separate from
logging: a log entry does not replace a precise HTTP error response.

If a cross-cutting logging requirement emerges, add it deliberately in a
shared module and cover it with a test; do not grow per-router logging formats.
