🎯 **What:** The testing gap addressed
This PR introduces test coverage for the error-handling logic inside `salvarEmergenciaAction` wrapper (`src/app/(app)/clinica/emergencia/actions.ts`). Previously, the `catch` block that traps custom `RoleError`s and logs generic internal errors was completely untested, masking potential regressions.

📊 **Coverage:** What scenarios are now tested
- The scenario where the action fails due to a `RoleError` (e.g. from `requireRole`), verifying that `{ error: err.message }` is correctly returned without triggering unexpected internal log noise (`console.error`).
- The scenario handling unexpected generic exceptions (e.g. from `getTenantContext`), verifying that it responds with a unified `{ error: "Erro interno no servidor." }` payload and appropriately traces the exception to `console.error`.

✨ **Result:** The improvement in test coverage
The wrapper's exception flows are now covered, increasing confidence for potential refactoring. We maintain the exact existing testing patterns inside the repository via `vitest` with hoisted mocks.
