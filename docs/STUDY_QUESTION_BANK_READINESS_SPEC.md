# Study Question Bank and Planner Readiness

Status: Implementation prepared in the consolidated local patch; Codespace application and acceptance validation pending.
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

A replacement does not rewrite an unfinished session. The old question
remains active for an unfinished Review/Gate/Guided Practice session but
is marked unavailable for newly created sessions. A replacement is
appended with a new ID/version and points to the superseded question.
No mid-session replacement is offered. If the user needs to change a
selected question in an unfinished session, that requires a separate,
auditable session-level workflow.

## 4. Topic preparation status

Proposed controls:
- Draft: preparation incomplete; not eligible for normal planner work
  that depends on readiness.
- Ready: meets the readiness checks and may enter planner eligibility,
  subject to normal lifecycle and prerequisites.
- Excluded: explicitly kept out of future planner generation without
  deleting the topic or its history.

Show actionable reasons why a topic is not Ready.

Existing legacy topics remain planner-compatible if their
`preparation_status` is absent. The UI labels them “Needs review (legacy)”
and does not represent them as Ready. Newly imported topics default to
Draft.

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

The implemented initial rule is at least three usable Gate-purpose
questions, at least two usable Review/Retry questions, and 3–5 total
questions eligible for new sessions. Ready is explicitly user-approved
but is automatically downgraded to Draft if a later objective or
question-bank edit invalidates these checks.

Objective validation must reject generic placeholders such as
"General", "TBD", "N/A" and "To be determined", without relying only
on a simplistic string blacklist.

## 7. Planner behaviour

Do not silently treat unprepared topics as Ready.

Show clear blockers: missing or generic objective, missing objective
type, insufficient active Gate questions, incomplete criteria,
topic exclusion or unit exclusion.

Existing due Reviews and unfinished Gate sessions retain their original
selected IDs. Unit exclusion and topic Excluded status prevent new
planner selection; they do not delete existing Reviews, TaskEvents,
question records or unfinished session evidence. New initial-learning
work is filtered through topic readiness and unit exclusion.

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

## 9. Resolved implementation decisions

- Versioning: append-only RetrievalTask IDs with `version_number` and
  `supersedes_task_id`; the old prompt and criteria are not overwritten.
- Future availability: `available_for_new_sessions` is separate from
  `active`, so an in-flight session can finish with the exact question
  it selected while new sessions use only eligible versions.
- Ready: manually approved after objective and question checks; edits
  that invalidate the checks automatically return the topic to Draft.
- Thresholds: 3–5 total eligible questions, at least three Gate and at
  least two Review/Retry questions, with non-empty prompts and answer
  criteria. Generic objectives are blocked in addition to missing ones.
- Existing legacy topics without explicit preparation status remain
  eligible until reviewed; newly imported topics default to Draft.
- Unit exclusion affects future new-topic planner selection and is
  reversible. Existing Review/Gate work and historical records remain.

The implementation is present in the consolidated patch but has not
yet passed the Codespace validation cycle. Preserve this document's
acceptance checklist and complete it against the applied patch.
