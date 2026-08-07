# Module 5 Run 1 — web boundary

Multiple Ask has no student page in this run. The prepared JSON BFF routes under `/api/ai/multiple-ask/` return 404 before authentication, parsing, or internal service work unless `MULTIPLE_ASK_RUN1_ENABLED=true`.

Session-create and pasted-text contracts require `boardId`, `classId`, `subjectId`, and optional `chapterId`, using bounded safe identifiers. These immutable values are carried only in the signed BFF request and persisted by the service; finalization uses its opaque session ID and request ID.

For files, the BFF accepts metadata only and returns one short-lived direct-upload capability. The supported response contract is `PUT` plus `Content-Type` and `x-upsert: false`; it contains no service-role credential, storage credential, Railway URL, OCR key, or provider key. Image/PDF bytes go directly to the private temporary bucket and never transit Vercel or DeepSeek. The bucket must be private and pre-created by an operator; this run does not create it.

Finalization and pasted text only create a durable validation job. They do not expose a job worker URL or consume quota. Run 2 also defines protected polling and correction contracts; polling returns only safe job/item metadata, labels, section context, counts, retention expiry, and safe terminal error codes. A correction explicitly supplies `short`, `long`, or `mcq`; MCQ requires ordered A–D options. Source text, uploaded bytes, private object keys, and signed URLs never appear in browser responses. Single Ask remains its existing typed-text-only `/api/ai/ask` feature, unchanged.
