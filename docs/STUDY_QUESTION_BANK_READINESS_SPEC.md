# Study Question Bank and Planner Readiness

Status: Draft for review; not implemented.
Date: 21 November 2026.
This is additive to the locked Study MVP v1.2 specification. It must
not silently weaken or rewrite that specification.

## 1. Objective

Make sure topics entering the Study planner are properly prepared.
Provide question-bank management without corrupting historical attempts
or scheduled-session selections.

## 2. Question management

For each topic, support:
- View active and inactive questions.
- Add a question with expected answer criteria.
- Edit and replace questions.
- Deactivate questions for future selection.
- Restore previously deactivated questions.
- Identify questions used by unfinished and historical sessions.

Retain the existing prompt, expected answer criteria, task type,
purpose and estimated duration fields.

## 3. Historical safety

Historical TaskEvents must continue to refer to the exact question
version that was attempted.

Editing wording or expected criteria must not silently change the
meaning of an old attempt. Prefer creating a new question ID/version,
deactivating the superseded question for future use, and retaining
the old question for history.

Scheduled Review selections and unfinished Gate selections are
immutable. Editing or deactivating a question must not silently
change an existing session's selected IDs.

Any explicit replacement inside an unfinished session needs its own
auditable workflow and must be designed before implementation.

## 4. Topic preparation status

Proposed controls:
- Draft: preparation incomplete; not eligible for normal planner work
  that depends on readiness.
- Ready: meets the readiness checks and may enter planner eligibility,
  subject to normal lifecycle and prerequisites.
- Excluded: explicitly kept out of future planner generation without
  deleting the topic or its history.

Show actionable reasons why a topic is not Ready.

Existing legacy topics must not silently disappear from the planner.
Define a transparent backwards-compatible treatment before coding.

## 5. Unit-level exclusion

Add a reversible unit-level planner exclusion. It must:
- Exclude its topics from new planner selection.
- Preserve all academic content, question banks and history.
- Clearly display the excluded state.
- Define what happens to already scheduled work and unfinished sessions.
- Never delete or archive academic content as a side effect.

## 6. Readiness validation

Check that:
1. A meaningful learning objective exists.
2. Objective type is present and valid.
3. Sufficient active, usable retrieval questions exist.
4. Questions have meaningful expected answer criteria.
5. Question purposes and types are suitable for the topic lifecycle.
6. Neither the topic nor its unit is excluded.

The locked Study specification requires 3–5 retrieval tasks per topic,
at least three selected Gate tasks, and 2–3 tasks for each Review.

Proposed initial rule: at least three usable active Gate-purpose
questions, with a useful bank of 3–5 tasks. Confirm exact thresholds
and warning/blocking behaviour before implementation.

Objective validation must reject generic placeholders such as
"General", "TBD", "N/A" and "To be determined", without relying only
on a simplistic string blacklist.

## 7. Planner behaviour

Do not silently treat unprepared topics as Ready.

Show clear blockers: missing or generic objective, missing objective
type, insufficient active Gate questions, incomplete criteria,
topic exclusion or unit exclusion.

Do not silently drop existing obligations. Define interactions with
protected new learning, prerequisites, existing reviews, Gate
lifecycle and unfinished sessions.

## 8. Acceptance tests

- [ ] Add a question and verify it appears in the active bank.
- [ ] Edit/replace without changing historical TaskEvents.
- [ ] Deactivate and verify it is not selected in new sessions.
- [ ] Restore and verify future eligibility.
- [ ] Preserve scheduled Review selections.
- [ ] Preserve unfinished Gate selections.
- [ ] Missing/generic objectives prevent Ready status.
- [ ] Insufficient Gate questions prevent readiness.
- [ ] Valid prepared topics become eligible.
- [ ] Unit exclusion is reversible and preserves history.
- [ ] Legacy state loads without data loss.
- [ ] CSV import remains safe with conflicting existing questions.
- [ ] Add planner, history and snapshot regression tests.

## 9. Decisions required before coding

- Exact question versioning model.
- Exact objective validation examples and rules.
- Whether Ready is manually approved, automatically derived, or both.
- How selected questions can be replaced in unfinished sessions.
- How unit exclusion handles already scheduled obligations.
- How legacy topics receive readiness without silently losing work.

Do not begin schema changes until these decisions and migration
behaviour are explicit.
