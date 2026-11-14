Study System App — MVP v1.2 FINAL (Locked Reference Specification)
Status: Locked for implementation. Includes the three pre-handoff clarifications.
Version: MVP v1.2
Reference date: 14 November 2026
Repository: MoreMaina/personal-assistant
Authority: Sections 0–17 below are the normative product requirements. This is a requirements specification, not a design document: implementation details may differ where the mandatory acceptance tests still pass. Do not silently relax or reinterpret a requirement. The implementation assessment in Appendix A is historical/non-normative evidence about the built app; it does not override the requirements.
0. How to use this document
Three requirements are load-bearing and must not be relaxed without formally reopening the design:
The eight metrics in §11 must be computable from immutable event history alone.
The daily budget in §7 must be mechanically enforced, not merely displayed.
Every considered task must receive exactly one recorded disposition — no silent drops.
The four-week trial exists to produce evidence. If the app cannot produce the evidence, the trial is void. That is the release bar.
1. Product summary
Build a local-first, single-user study scheduler for one university student managing 4 courses, 12 units, approximately 84 topics, two CATs, and finals across 10 weeks at approximately 180 minutes of independent study per day, six days per week.
The app must:
Track courses → units → topics → learning objectives → retrieval tasks.
Gate each topic through an initial-learning check before starting spaced repetition.
Generate topic-level review sequences using progressive intervals anchored to the previous successful review.
Produce daily plans that never exceed the time budget.
Allocate time across new learning, assignments, corrective work, reviews, and mixed practice from one shared budget.
Require explicit DO / DEFER / RELEARN / SKIP decisions when work cannot be completed.
Log learning attempts and scheduling decisions as immutable events.
Compute eight weekly metrics for a four-week evaluation.
Core learning cycle: Understand → Define objective → Retrieve → Check → Correct → Schedule → Review → Measure → Adjust.
Core scheduling question: What should I study today, given what's due, what's overdue, what I'm struggling with, what's coming up, and how much time I actually have — and what am I choosing not to do?
1.1 Design principles
Principle
Consequence
Logging is the product
Recording an attempt or decision must be quick and unambiguous. Target ≤30 seconds per task on a phone.
Explicit trade-offs
Every considered task is either allocated time or receives a recorded decision explaining why it was not.
Validate before automating
No dependency graph, scoring formula, or calibration algorithm in the MVP.
One time budget
New learning, assignments, reviews, mixed practice, corrective work, and recovery all draw from the same daily budget. Reservations are portions of the budget, never additions.
Immutable evidence
Historical metrics must not change when an estimate, priority, due date, or current state is later edited.
2. Scope
2.1 In scope
Everything in §§4–12, including the complete event model, gate/review lifecycle, daily allocation engine, eight metrics, screens, settings, logging and exports.
2.2 Out of scope (Phase 2+)
Automatic dependency propagation.
Automated priority-scoring formulas.
Continuous duration-calibration algorithms.
PARK / RETIRE as separate dispositions (MVP uses SKIP + re-entry).
Multi-user, sharing, cloud collaboration, gamification, or social features.
AI-generated questions or notes.
Predictive analytics beyond the eight specified metrics.
2.3 Locked design decisions
Decision
Locked choice
Review granularity
One review sequence per topic.
Retrieval tasks
A question bank is selected from at each review event.
Review logging
One immutable TaskEvent per individual attempt or decision.
Gate source of truth
Derived from immutable TaskEvent records.
Time origin (Day 0)
Actual gate-completion date, not lecture date.
Intervals
1, 3, 7, 14, 30 days, each from the previous successful review.
Partial work
Separate WorkSession records.
Deferral limit
3 deferrals force an explicit decision.
SKIP
Never inferred; always requires a reason and re-entry condition.
On-time metrics
Use immutable intended_due_date.
Daily budget
One shared budget, default 180 minutes.
Post-finals
No ordinary reviews scheduled past the last final exam.
Mixed practice
Flex block, 10-minute minimum when due and capacity permits.
Calibration
Manual evidence review after Week 4.
These are fixed for the trial. Changing any of them invalidates the four-week comparison unless the change qualifies as a documented blocking bug fix under §15.
3. Target user and workload
Item
Default
Notes
Courses
4
Course I–IV, editable.
Units per course
3
Codes a–l.
Topics per unit
7–10
Must support the actual syllabus, not assume exactly 7.
Planning estimate
84 topics
Assumption only.
Maximum supported
120 topics
Performance must be tested at this limit.
Independent study
180 min/day
One shared budget.
Study days
Mon–Sat
Sunday is rest day.
Trial duration
4 weeks
Engine frozen throughout.
Review stages
5
+1, +3, +7, +14, +30 days.
Course and question preparation time is tracked separately through content_preparation events. It is not counted against the study budget and is excluded from study-duration metrics.
4. Data model
General rules:
IDs are stable.
Dates use ISO YYYY-MM-DD; timestamps use ISO 8601 with timezone.
Study dates are computed in the user's configured local timezone (default: device timezone).
Historical event records are immutable. Mutable entities hold current state but must never rewrite the evidence used in metrics.
4.1 Course
{id, name, code, color, created_at}
4.2 Unit
{id, course_id, code, name, order_index}
4.3 Topic
Field
Type / values
Notes
id, unit_id, topic_number, title, order_index
IDs / values
Identity and display order.
learning_objective
text
What the student must be able to do.
objective_type
recall, explain, compare, solve, argue
Objective category.
prerequisite_topic_ids
FK[]
Manual; warnings only, no propagation.
status
not_started, in_learning, active, relearn, maintenance_pending_classification, archived, optional_maintenance, carried_forward
Lifecycle state.
planned_consolidation_date
date
When consolidation is scheduled.
consolidation_estimated_duration_min
int
Default 45 (2-topic days) / 35 (3-topic days).
initial_study_date
date
Date gate was actually passed (Day 0).
gate_passed
bool
Derived write-through from gate events.
gate_result
pending, passed, failed, skill_based_passed
Gate outcome.
weakness_flag
bool
Manual or derived from review results.
topic_importance
low, medium, high, critical
Academic importance.
initial_study_date is never automatically set to the lecture date.
4.4 Lecture
{id, unit_id, topic_id, date, kind}, where kind ∈ {lecture, lab, tutorial}. Lectures drive the planned new-topic schedule. Changing a lecture date updates future plans but must not modify historical study records.
4.5 RetrievalTask
Field
Type / values
Notes
id, topic_id
IDs
Task and parent topic.
prompt, expected_answer_criteria
text
Retrieval prompt and checking criteria.
task_type
definition, explanation, comparison, problem, essay_plan, application
Retrieval form.
purpose
gate, review, retry, corrective, mixed, sampler
Intended use.
estimated_duration_min
int
Editable; defaults below.
last_used_on
date
Supports selection heuristic.
active
bool
Whether selectable.
Default duration estimates: definition 2 min; explanation 5; comparison 5; problem 8; essay plan 10; application 8. Estimates include retrieval, checking, and ordinary correction. Question-creation time is separately tracked as content_preparation and never counted in study duration. Each topic should have 3–5 useful retrieval tasks. The gate requires at least 3 active gate-purpose tasks.
4.6 ReviewEvent
One row per scheduled or retry review of a topic. It does not represent an individual question.
Field
Type / values
Notes
id, topic_id
IDs
Identity and topic.
stage
int 1–5
Review stage.
event_kind
scheduled_review, retry
Normal or retry event.
holds_stage
bool
True for retries.
selected_task_ids
FK[]
Must be selected before attempt begins, not retrospectively.
overall_result
green, yellow, red, incomplete
Aggregate result.
yellow_gap_severity
minor, substantive, null
Review-level severity.
source_review_id
FK nullable
Review that produced this event.
intended_due_date
date
Immutable; post-Sunday-shift, pre-deferral.
current_due_date
date
Mutable; queue ordering only.
completed_at
timestamp
Local-date derivation per §6.4.
priority_at_scheduling
int 1–5
Immutable snapshot; metrics use this.
current_priority
int 1–5
Recomputed daily; changes logged.
defer_count
int
Incremented on each defer.
moved_from_sunday
bool
Sunday shift marker.
status
pending, in_progress, completed, deferred, skipped, missed, retired
Current state.
Each review selects 2–3 retrieval tasks.
4.7 TaskEvent — immutable log
Every attempt, scheduling event, decision, work session, and priority change produces a row here. This is the source of truth for all metrics.
Fields include:
id, logged_at;
event_type;
subject_type, subject_id;
review_event_id, retrieval_task_id;
gate_session_id, gate_selected_task_ids_snapshot, skill_demonstrated_without_hints;
work_session_id, related_event_id;
estimated_duration_min_at_event, task_type_at_event, priority_at_event;
intended_due_date_at_event, current_due_date_at_event;
actual_duration_min, result, yellow_gap_severity;
disposition, reason, critical_error_flag, defer_count_at_event, re_entry_condition;
old_priority, new_priority for priority changes.
event_type values: review_scheduled, attempt, gate_attempt, defer, skip, relearn, work_session, forced_disposition, priority_change, skip_resolution, content_preparation.
subject_type values: review_event, retrieval_task, gate_attempt, assignment, corrective_task, topic_consolidation, mixed_practice, sampler.
disposition values for forced_disposition: complete, split, relearn, skip, override_defer.
4.8 TaskEvent rules (binding)
Every scheduled ReviewEvent emits a review_scheduled event.
The scheduling event snapshots intended due date, priority, and estimated duration.
Each individual retrieval-task attempt emits its own TaskEvent.
An attempt links explicitly to its ReviewEvent (or gate session) and the specific RetrievalTask.
Gate attempts share a gate_session_id and identical gate_selected_task_ids_snapshot values.
A deferral never requires a G/Y/R result.
A skip never requires a G/Y/R result.
A completed retrieval attempt requires a G/Y/R result.
A work session records duration and progress; it does not require a G/Y/R result.
Historical events are never edited to reflect later estimates, priorities, or decisions.
Resolving a skip emits a new skip_resolution event referencing the original; the original is never modified.
Any current-state change must be reconstructible from event history or stored as an explicitly derived field.
4.9 Duration rules by event type
Event type
actual_duration_min
result
attempt
Positive
Required G/Y/R
gate_attempt
Positive
Required G/Y/R
work_session
Positive
Null
content_preparation
Positive
Null
defer
Zero
Null
skip
Zero
Null
forced_disposition
Zero unless separate session
Null
review_scheduled
Null or zero
Null
priority_change
Null or zero
Null
skip_resolution
Null or zero
Null
task_type_at_event is required for retrieval attempts and null for events not concerning an individual retrieval task. Duration-error metrics use the estimate recorded at attempt time, never the current estimate.
4.10 WorkSession
{id, subject_type, subject_id, planned_duration_min, actual_duration_min, logged_at, notes}
subject_type ∈ {assignment, corrective, topic_consolidation}. A completed work session also generates a corresponding immutable TaskEvent.
Completion rules:
Assignment: complete when remaining_min ≤ 0 or user explicitly marks complete.
Corrective: complete only when user marks ready_to_retry.
Topic consolidation: a session does not pass the gate; the gate must be passed separately.
Partial work is never treated as completion of the underlying assignment or learning objective.
4.11 Exam
{id, course_id, type, date, coverage_units, coverage_topics}, where type ∈ {cat1, cat2, final}. last_final_exam_date is derived from the latest final exam date unless explicitly configured.
4.12 Assignment
{id, course_id, title, due_date, estimated_duration_min, remaining_min, max_session_min, importance, status}
max_session_min defaults to remaining_min.
importance ∈ {low, medium, high, critical}.
Assignments are first-class scheduled work items.
The app must not silently omit an assignment because its remaining workload exceeds today's capacity.
4.13 Settings
Setting
Default
study_days
Mon–Sat
rest_day
Sunday
daily_budget_min
180
review_reserve_min
30
min_mixed_practice_min
10
mixed_practice_target_mon_wed
30
mixed_practice_target_thu_fri
25
repair_recovery_cap_min
30
recovery_block_min
25
default_assignment_session_target_min
30
intervals_days
[1, 3, 7, 14, 30]
gate_threshold_pct
60
defer_limit
3
skip_rate_threshold_pct_p45
15
Also store trial start/end dates, final examination dates, Week 4 evaluation dates, current engine version, and engine-change history.
Binding editability: daily budget, review reserve, repair/recovery cap, gate threshold, defer limit, intervals, and final-exam date must be editable in Settings. Trial evidence must be actionable without a code change. Recovery block is a target within the repair/recovery budget, never an addition to it.
4.14 WeekMetrics
{week_number, week_start, week_end, overall_on_time_completion_pct, priority_1_3_on_time_completion_pct, deferral_rate_pct, total_deferral_decisions, median_duration_error_pct, duration_error_sample_counts, overdue_critical_backlog_min, priority_1_3_skip_count, priority_4_5_skip_rate_pct, notes}.
Each snapshot records the data used to compute it. Later estimate or state changes must not retroactively alter a snapshot.
5. Functional requirements
5.1 Register and onboarding
The user can create 4 courses, 12 units (3 per course), add 7–10 topics per unit, bulk-import from CSV/paste, enter lecture/CAT/exam/assignment dates, enter learning objectives and types, and create 3–5 retrieval tasks per topic.
CSV topic fields: course, unit, topic_number, title, learning_objective, objective_type.
Acceptance: course/unit scaffold plus topic-register import usable within 30 minutes. Retrieval-task preparation is separate. Preparation duration is logged via content_preparation events and excluded from study budget and duration metrics.
5.2 Topic preparation
Per topic record learning objective, objective type, 3–5 retrieval prompts, expected answer criteria, task types, estimated durations, and known prerequisites.
Preparation targets: approximately 10 minutes for simple topics and up to 30 minutes for dense topics. These are targets to validate, not limits. If preparation consistently exceeds them, record evidence for Week 4; do not expand scope prematurely.
5.3 Initial-learning gate
Entry: topic enters in_learning; planned_consolidation_date is recorded separately from eventual initial_study_date.
Procedure: closed-book attempt using at least 3 selected gate tasks from the existing bank. Each attempt emits a gate_attempt TaskEvent carrying gate_session_id, retrieval_task_id, gate_selected_task_ids_snapshot, result, actual duration, and critical_error_flag.
All three pass conditions must hold:
All selected gate tasks attempted.
At least 60% Green (Yellow and Red do not count as correct).
No critical conceptual error.
Skill-based alternative: user may record that the skill was demonstrated without hints. It requires a successful result and no critical error.
Single-source-of-truth derivation:
gate_session := latest_gate_session(topic)
selected     := gate_session.gate_selected_task_ids_snapshot
attempted    := distinct_retrieval_task_ids(gate_session)
all_attempted := attempted == selected
correct_pct  := green_attempt_count(gate_session) / len(selected) * 100
passed       := all_attempted
                and correct_pct >= 60
                and not critical_error(gate_session)
On pass: gate_passed = true; gate_result = passed | skill_based_passed; initial_study_date is actual pass date; status becomes active; generate Review 1 at +1 day subject to Sunday and post-finals rules.
On fail: status becomes relearn; no normal reviews are generated; corrective work and a new gate attempt are required. A topic may never enter active without a passed gate.
5.4 Review-task selection and aggregation
Each ReviewEvent selects 2–3 tasks before the student starts.
Selection heuristic: include at least one task not most recently used when available; cover different task types where possible; user may override. The event preserves selected task IDs for its duration. Individual answers emit separate TaskEvents linked to both the review event and the retrieval task.
Aggregation, in order:
Any attempted task Red → overall_result = red (immediate failure).
Not all selected tasks attempted and no Red → incomplete.
All attempted and any Yellow → yellow.
All Green → green.
Yellow severity is recorded per attempt. If multiple Yellows occur, the event is substantive if any Yellow is substantive.
Incomplete reviews keep the same ReviewEvent and tasks, set status to in_progress, and carry remaining selected tasks to the next study day. Do not create a second normal review event.
5.5 Review scheduling
Intervals, each from the previous successful completion date and never from lecture date:
From
Next interval
Initial learning
Review 1 at +1 day
Review 1
Review 2 at +3 days
Review 2
Review 3 at +7 days
Review 3
Review 4 at +14 days
Review 4
Review 5 at +30 days
Sunday shift: a date falling on Sunday moves to Monday; set moved_from_sunday = true. The post-shift date becomes intended_due_date.
Every generated normal review or retry emits a review_scheduled TaskEvent snapshotting intended due date, priority at scheduling, estimated duration, and review-event ID. The scheduling event is immutable.
5.6 Dispositions
Every considered task receives exactly one current planning disposition:
Disposition
Meaning
DO
Allocate time today.
DEFER
Preserve and reschedule.
RELEARN
Schedule corrective learning.
SKIP
Remove from active queue with reason and re-entry condition.
PROTECTED is a display/capacity category, not a disposition. No task or minute may be counted twice.
Three-deferral rule: at 3 deferrals the daily plan cannot finalize until the user records a forced decision: complete, split, route to RELEARN, explicitly SKIP (with reason and re-entry condition), or override with another defer plus an explicit reason.
SKIP is never inferred from deferral count. Every forced decision emits a TaskEvent. Overrides appear on the Week 4 dashboard.
5.7 Priority order
Tiers:
Imminent exams and assignment deadlines.
Essential new learning and foundational concepts for upcoming topics.
Corrective learning for important or persistently weak material.
Other due reviews, weighted by importance and weakness.
Routine reviews of reliably recalled material.
Tie-breakers, in order: nearest exam/deadline → prerequisite for learning within 48 hours → weakest retrieval performance → greater academic importance → longest overdue.
Final tie-breaker: prefer work that fits remaining time, except essential priority 1–2 work must never be silently dropped for not fitting. Split it, reduce scope, rebalance lower-priority allocations, or surface an explicit capacity conflict. The scheduler must not invent a scoring formula.
5.8 Repair and recovery budget
Corrective relearning and backlog recovery share one cap (default 30 min/day). The recovery-block target (25 min) sits within this cap. Neither is added on top of the 180-minute budget.
Urgent prerequisite exception: if corrective work concerns a prerequisite for a lecture or assessment within 48 hours, the user may explicitly override the cap. The override must be logged, may reallocate from mixed-practice expansion / lower-priority reviews / assignment expansion, must never exceed the daily budget, and must never bypass the gate.
5.9 Missed-day protocol
One missed day: do not double the next day's workload. Catch-up priority: current lectures + urgent assignments → imminent exam prep + foundational → weak/RELEARN → other reviews. Drop mixed-practice expansion first. Skip low-value priority-5 reviews as needed. Defer only important tasks that cannot fit.
At least 2 consecutive missed days: resume current lectures immediately; use recovery block within the shared cap for the most important backlog; do not repay the entire backlog; recovery is capped at 3 consecutive study days, after which remaining items require explicit DEFER or SKIP; never bypass the gate to clear backlog.
After any missed day, the plan must never exceed the daily budget.
6. Review state machine
Current state / result
Required transition
Gate passes
Activate topic; schedule Review 1.
Gate fails
Topic → RELEARN; no normal review.
Normal review Green
Advance one stage.
Normal review Yellow, minor
Advance one stage.
Normal review Yellow, substantive
Create retry at held stage for next study day.
Normal review Red
Topic → RELEARN; create corrective work.
Corrective work completed
Mark ready_to_retry; schedule retry at held stage next study day.
Retry Green
Reactivate; advance to next normal stage.
Retry Yellow, minor
Reactivate; advance to next normal stage.
Retry Yellow, substantive
Continue corrective work; retry again at same stage.
Retry Red
Continue corrective work; retry again at same stage after corrective work.
Incomplete review
Keep same ReviewEvent and stage; resume remaining tasks next study day.
Successful Stage 5
End normal review sequence.
Next review would fall after last final
Do not generate; route to post-finals classification.
6.1 Retry rules
A retry is a distinct ReviewEvent: event_kind = retry, holds_stage = true, stage = held stage, source_review_id = failed review. A retry does not advance the stage merely because it was completed. A successful Stage 2 retry schedules Stage 3, not Stage 4.
6.2 Completion date
A multi-question review's completion date is the local date on which it reaches a terminal result — derived from its TaskEvents using the final required attempt, or the first Red attempt that causes immediate failure.
6.3 Interval advancement
def advance_interval(review_event, completed_date):
    if review_event.stage >= 5:
        route_to_post_finals_classification(review_event.topic)
        return

    target_stage = review_event.stage + 1
    interval = intervals_days[target_stage - 1]
    next_date = completed_date + days(interval)

    if next_date.weekday() == SUNDAY:
        next_date = next_monday(next_date)

    if next_date > settings.last_final_exam_date:
        route_to_post_finals_classification(review_event.topic)
        return

    create_review_event(
        topic_id=review_event.topic_id,
        stage=target_stage,
        event_kind="scheduled_review",
        holds_stage=False,
        intended_due_date=next_date,
        current_due_date=next_date,
        source_review_id=review_event.id,
    )
    emit_review_scheduled_event()
For a retry, the same rule applies after a successful retry. A failed retry does not advance. The next normal review is always generated from the completed source event's actual completion date.
6.4 Post-finals lifecycle
After last_final_exam_date, close the active ordinary review queue. Generate no new ordinary reviews. Any topic whose sequence terminates or whose next review would fall past the last final enters maintenance_pending_classification.
The user classifies it as archived, optional_maintenance, or carried_forward. Nothing is scheduled past finals unless the user explicitly opts into maintenance/carry-forward.
7. Daily allocation engine (authoritative)
7.1 Non-negotiable invariant
Total allocated study minutes must never exceed the daily budget (default 180). New learning, assignment sessions, reviews, mixed practice, corrective learning, and recovery all draw from the same shared budget. Reservations are never additions.
7.2 Plan inputs
The scheduler considers:
Topics scheduled for consolidation (planned_consolidation_date == today).
Topics in in_learning whose planned consolidation date is in the past; remaining consolidation is consolidation_estimated_duration_min − logged work-session minutes on that topic.
Due, overdue, deferred, and in_progress ReviewEvents.
Assignments due within 7 days.
Corrective learning and recovery needs.
Mixed-practice blocks due that day.
Task estimates and current priorities.
Existing deferral counts.
Examination proximity.
Remaining budget.
in_progress ReviewEvents are plan inputs. Their current_due_date is set to the next study day after an incomplete attempt. Allocating them does not create a new ReviewEvent.
Default new-topic allocations: Mon–Wed 45 min/topic; Thu–Fri 35 min/topic. If consolidation overruns, log partial work and keep the topic in in_learning. Never mark it active before gate passes.
7.3 Reservation and allocation order
After protected new learning:
Reserve capacity for priority 1–3 reviews, capped at review_reserve_min (30).
Reserve minimum mixed practice (10) only if capacity remains and the block is due.
Allocate assignment sessions from remaining free capacity.
Allocate priority 1–3 reviews from their reserve first, then free capacity.
Allocate corrective/recovery within the shared cap (30).
Expand assignment sessions by deadline urgency.
Allocate lower-priority reviews.
Expand mixed practice from capacity still available.
Assignment session formula:
assignment_session = min(
    assignment.remaining_min,
    assignment.max_session_min,
    settings.default_assignment_session_target_min,
    available_free_minutes
)
Assignments are splittable. Extension beyond the target is allowed only from free capacity, capped by max_session_min and remaining workload. The whole allocated session is counted once — extension must not duplicate time. An assignment receiving no session today remains visible with explicit disposition and reason.
7.4 Corrective and recovery
Corrective work and recovery share the daily budget and shared cap. Selection order: prerequisite within 48 hours → imminent exam → weakness severity → academic importance.
If urgent prerequisite repair exceeds the cap, require an explicit override and reclaim existing time. Never add time and never silently consume protected new-learning time.
7.5 Review allocation
Use the reserve pool first for priority 1–3, then free capacity.
If selected questions cannot all fit: attempt a subset; keep the ReviewEvent in_progress; carry remaining questions to the next study day. Do not create a duplicate normal review event. If no work can be done, record the appropriate decision.
Priority 4–5 reviews are considered after higher-priority work. A three-times-deferred task requires a forced decision; it can never be silently skipped or deferred again.
7.6 Mixed practice allocation
Block
Target
Minimum when due and capacity permits
10 min
Mon–Wed
30 min
Thu–Fri
25 min
Saturday sampler
80 min (+ up to 10 min analysis)
Priority 1–3 work and urgent assignments take precedence over mixed-practice expansion. Priority 4–5 reviews may absorb time that would otherwise expand it. The minimum may be reduced only when a higher-priority requirement leaves no feasible alternative, and the reduction must be visible in the plan.
7.7 Authoritative allocation pseudocode
Implementations may differ provided §14 passes. The following pseudocode is authoritative for the allocation order and invariants:
def generate_daily_plan(date):
    B = settings.daily_budget_min
    plan = Plan(date=date, budget=B)
    remaining = B  # one shared budget; nothing is ever added on top

    # 1. Protected new learning (includes overdue in_learning topics)
    for topic in topics_with_planned_consolidation(date) + overdue_in_learning_topics(date):
        cost = estimate_remaining_consolidation_minutes(topic)
        allocated = min(cost, remaining)
        if allocated > 0:
            plan.add_protected(topic, allocated, kind="topic_consolidation")
            remaining -= allocated
        if allocated < cost:
            plan.add_defer(topic, reason="insufficient_consolidation_time")

    # 2. Identify and reserve priority 1-3 review capacity
    p13_reviews = sorted_reviews(
        due_reviews(date) + overdue_reviews() + deferred_reviews() + in_progress_reviews(),
        priorities={1, 2, 3},
    )
    p13_needed = sum(estimated_minutes(r) for r in p13_reviews)
    p13_reserve = min(p13_needed, settings.review_reserve_min, remaining)
    remaining -= p13_reserve

    # 3. Reserve minimum mixed practice only if capacity permits
    mixed_reserved = 0
    if mixed_practice_due(date) and remaining >= settings.min_mixed_practice_min:
        mixed_reserved = settings.min_mixed_practice_min
        remaining -= mixed_reserved

    # 4. Assignment sessions from free capacity
    assignment_allocations = {}
    for a in sort_assignments_by_deadline():
        target = min(
            a.remaining_min,
            a.max_session_min or a.remaining_min,
            settings.default_assignment_session_target_min,
            remaining,
        )
        if target > 0:
            assignment_allocations[a.id] = target
            remaining -= target

    # 5. Priority 1-3 reviews: reserve first, then free
    p13_reserve_left = p13_reserve
    for review in p13_reviews:
        if review.defer_count >= settings.defer_limit:
            plan.require_forced_decision(review)
            continue
        available = p13_reserve_left + remaining
        allocated = allocate_review_tasks_that_fit(review, available)
        reserve_used = min(allocated, p13_reserve_left)
        p13_reserve_left -= reserve_used
        remaining -= allocated - reserve_used
        if allocated > 0:
            plan.add_do(review, allocated)
            if allocated < estimated_minutes(review):
                plan.mark_in_progress(review)
        else:
            plan.require_disposition(review, reason="capacity")

    remaining += p13_reserve_left  # release unused reserve
    p13_reserve_left = 0

    # 6. Corrective + recovery, one shared cap
    repair_used = 0
    for task in sort_repair_queue():
        if repair_used >= settings.repair_recovery_cap_min:
            break
        alloc = min(
            estimated_minutes(task),
            settings.repair_recovery_cap_min - repair_used,
            remaining,
        )
        if alloc > 0:
            plan.add_repair(task, alloc)
            repair_used += alloc
            remaining -= alloc

    # 7. Expand assignment sessions from remaining capacity
    for a in sort_assignments_by_deadline():
        existing = assignment_allocations.get(a.id, 0)
        cap = (a.max_session_min or a.remaining_min) - existing
        unallocated_work = a.remaining_min - existing
        extra = min(cap, unallocated_work, remaining)
        if extra > 0:
            assignment_allocations[a.id] = existing + extra
            plan.extend_assignment(a, extra)
            remaining -= extra

    # 8. Lower-priority reviews
    for review in sorted_remaining_reviews(priority_order=True):
        if review.already_allocated_today:
            continue
        if review.defer_count >= settings.defer_limit:
            plan.require_forced_decision(review)
            continue
        alloc = allocate_review_tasks_that_fit(review, remaining)
        if alloc > 0:
            plan.add_do(review, alloc)
            remaining -= alloc
            if alloc < estimated_minutes(review):
                plan.mark_in_progress(review)
        else:
            plan.require_disposition(review, reason="capacity")

    # 9. Expand mixed practice only from remaining capacity
    if mixed_practice_due(date) and remaining > 0:
        extra = min(mixed_practice_target(date) - mixed_reserved, remaining)
        if extra > 0:
            plan.extend_mixed_practice(extra)
            remaining -= extra

    # 10. Validate
    resolve_unallocated_assignments(plan)
    resolve_unallocated_reviews(plan)

    assert plan.allocated_minutes() <= B
    assert not plan.has_silent_drops()
    assert not plan.has_conflicting_dispositions()

    if plan.has_priority_1_3_skip():
        plan.raise_review_flag()

    return plan
Binding implementation rules:
A reservation is never counted twice.
Any unused reservation returns to available capacity.
Corrective work, recovery, assignment sessions, and mixed practice all consume the same budget.
A partial review does not create a second ordinary review event.
Every unresolved task receives a recorded disposition.
The plan is validated before display.
An urgent prerequisite override must reclaim existing lower-priority allocations or force an explicit capacity decision. It must never increase the budget.
resolve_unallocated_*() binding behavior: each must emit an immutable defer or forced-disposition TaskEvent for every unallocated subject, with reason populated. The daily plan cannot finalize while any unallocated subject lacks a disposition event. This makes “no silent drops” a guarantee rather than an intention.
7.8 Required allocation tests
H1 — Canonical allocation. Budget 180; new learning 90; assignment 120 remaining due in 3 days; one priority-1 review of 10 min; mixed practice due. Expected: new learning 90 + assignment session 70 + priority-1 review 10 + mixed practice 10 = 180. No task disappears without a disposition.
H2 — Review flood. New learning 90; 100 min of priority-1 reviews; assignment 120 remaining; mixed practice due. Expected: reserve 30 for priority reviews; reserve 10 for mixed practice; allocate a 30-min assignment session; allocate approximately 50 min to priority reviews (30 reserve + 20 free); defer or force decisions on the rest. Total ≤180.
H3 — Empty day. No new topics, no assignments, no due reviews, mixed practice due. Expected: mixed practice expands to day's target. No fabricated work.
H4 — Budget fuzz. At least 10,000 randomized scenarios covering new learning, assignment loads, review floods, corrective work, recovery, mixed practice, repeated deferrals, urgent overrides. Every scenario satisfies allocated_minutes() ≤ daily_budget_min.
H5 — Silent-drop test. Every considered task has exactly one current disposition. No task appears in both DO and DEFER. Protected time is never a second allocation for a task already in DO or RELEARN.
8. Mixed practice and Saturday sampler
8.1 Mixed practice
Mon–Wed (30 min): 10 min retrieve earlier topics · 10 min distinguish related concepts · 10 min application/exam-style problem.
Thu–Fri (25 min): 5 min retrieve an older topic · 10 min compare related concepts · 10 min problem/exam-style answer.
Rotate the focus course weekly so all four courses receive regular practice. Interleave only where discrimination or method selection is part of the objective; do not randomly mix unrelated topics to create variety. Suggested pairs from prerequisite links / unit proximity are advisory only.
Mixed practice is built from active purpose=mixed questions across topic groups and requires at least 2 active topics. The question set is preserved once the session begins. If no eligible questions exist, record “practice unavailable,” distinct from a completed session.
8.2 Saturday sampler
80 minutes plus up to 10 minutes for analysis. Allocate 20 minutes per course. Use two questions per course from two different units, using covered material only.
Three-week unit rotation:
Week
Course I
Course II
Course III
Course IV
1
a, b
d, e
g, h
j, k
2
b, c
e, f
h, i
k, l
3
c, a
f, d
i, g
l, j
Repeat the cycle. Within each selected unit, rotate the topic number forward each cycle. Maintain a per-unit topic cursor so early topics are not repeatedly sampled while later ones are ignored.
After the sampler: record weak answers, identify affected topics, update weakness_flag, and preserve individual attempt results. Draw from active purpose=sampler questions. The question set is preserved once the session begins. Insufficient allocation or a missing saved question does not count as successful completion. The Saturday test is diagnostic sampling, not a comprehensive exam.
9. Assignment management
Each assignment records due date, estimated total duration, remaining estimated work, max session duration, importance, and status.
Due within 7 days → highest priority tier.
Due within 48 hours → capacity warning when remaining work competes with new learning and urgent reviews.
Partial work: each session creates a WorkSession and immutable work_session TaskEvent; the session reduces remaining_min. No G/Y/R is required for assignment work.
If the assignment cannot be completed today: schedule a realistic partial session or expose the capacity conflict explicitly. Never omit it because remaining duration exceeds available time.
10. Logging requirements
Every individual retrieval attempt records estimated duration at attempt time, actual duration, G/Y/R result, relevant task/review/gate relationships, and applicable disposition or completion state.
Every deferral, skip, relearning decision, forced disposition, and priority change is logged as an immutable event. A defer or skip must not require a fabricated learning result. A gate session must be reconstructible from its TaskEvents — no separate GateAttempt source-of-truth table is needed.
Interface requirements:
Reachable within 2 taps from Today and Review Queue.
≤30 seconds per task on a phone-sized screen, tested separately for attempts and decisions.
Must support G/Y/R attempts, minor/substantive Yellow, actual-duration entry, DEFER, SKIP (with reason + re-entry condition), quick corrective decisions, and partial work sessions.
A completed attempt without a result or required duration must prompt the user to finish logging. The app must never fabricate a result to make the log appear complete.
11. Metrics and Week 4 evaluation
All eight measures must be reproducible from immutable TaskEvent history, including immutable review_scheduled snapshots. Current estimates, current priorities, mutable due dates, and mutable statuses must never rewrite historical metrics.
11.1 The eight metrics
#
Measure
Definition
Target
1
Overall on-time completion
Review events completed on intended_due_date ÷ events intended due that week.
≥80%
2
Priority 1–3 on-time completion
Same, limited to priority_at_scheduling ∈ {1,2,3}.
≥80%
3
Deferral rate
Distinct events intended due that week receiving at least one DEFER by week-end ÷ events due that week.
≤20%
4
Total deferral decisions
Count of individual DEFER TaskEvents during the week.
Track
5
Median duration error
Median absolute percentage error by task type, where n ≥ 5.
≤25%
6
Overdue critical backlog
Sum of estimated minutes of overdue priority 1–3 events still pending/deferred/in-progress/missed at week-end.
No increase 2 consecutive weeks
7
Priority 1–3 skip count
Count of priority 1–3 events explicitly skipped.
0
8
Priority 4–5 skip rate
Distinct priority 4–5 events skipped ÷ priority 4–5 events due that week.
≤15%
Metric invariants:
Measures 1–3 and 6–8 use intended_due_date and priority_at_scheduling, never current_due_date or current_priority.
One event deferred five times in one week counts as one deferred event for Measure 3 and five deferral decisions for Measure 4.
Assignment completion is tracked separately and must not be silently mixed into review-event denominators.
Measure 5 uses estimated_duration_min_at_event and task_type_at_event snapshots. Assignment work sessions, mixed practice, and content preparation are excluded.
Duration error formula:
APE = |actual - estimated| / estimated × 100
Median is computed separately by task type. Exclude events with missing or zero estimates.
11.2 Dashboard flags
Any priority 1–3 skip → plan-review flag.
Overdue critical backlog increases for 2 consecutive weeks → recalculate the plan.
Deferral rate >20% for 2 consecutive weeks → review workload and prioritization.
On-time completion <80% for 2 consecutive weeks → review workload and scheduling.
Priority 4–5 skip rate >15% → workload-review flag.
Record skip counts alongside percentages, especially where the denominator is small.
11.3 Week 4 evaluation
Dashboard must show all eight metrics, targets, flags, and relevant sample counts. Export evidence as CSV and JSON. Evaluation must not require manual calculation.
At the end of Week 4, use evidence to decide whether any Phase 2 improvement is justified. Do not change the engine speculatively during the trial.
12. Screens
12.1 Today (default)
Show date and day type; PROTECTED (planned new learning and actual reservations); DO (allocated work in priority order with duration and running total); DEFER (unallocated with reasons); SKIP (with reasons and re-entry conditions); RELEARN (corrective work); assignments due soon; remaining budget and allocated minutes; capacity warnings; one-tap logging.
PROTECTED reservations and the tasks consuming them must not be counted twice. Today must answer: What must I learn today? What older material most needs attention? What realistically fits? What am I explicitly deferring or skipping, and why?
12.2 Review Queue
Display topic, selected tasks, stage, intended due date, current due date, Sunday-shift indicator, deferral count, priority, and status.
Filters: due today, overdue, deferred, in progress, skipped, by course, by priority. Bulk DEFER supported. Bulk SKIP requires a reason and re-entry condition per task.
12.3 Topic Register
Display course/unit, topic, learning objective, objective type, status, gate result, initial_study_date, planned_consolidation_date, next review, weakness flag, and prerequisites.
Actions: edit objectives/tasks; run/retry gate; mark corrective ready to retry; mark relearn; archive/classify after finals.
12.4 Review Log
Immutable TaskEvent stream, filterable by event type, subject, course/topic, result, disposition, and date. CSV export.
12.5 Calendar (read-only)
Week and semester views: lectures, consolidation dates, reviews, retries, assignments, CATs, finals. Changes flow through register, queue, or settings — never direct calendar editing.
12.6 Metrics Dashboard
Eight metrics, targets, sample counts, flag conditions, and Week 4 evidence export (CSV + JSON).
12.7 Settings
All §4.13 fields editable, with sensible defaults. Settings changes recorded in an audit log. Mid-trial engine changes require the documented bug-fix exception.
12.8 Onboarding
Course/unit creation; topic CSV import; retrieval-task creation; lecture dates; assignment deadlines; CAT and final exam dates.
13. Non-functional requirements
Local-first, single-user. Local storage (SQLite or equivalent); no backend required for the MVP.
CSV and JSON export of register, event history, and metrics.
Phone-friendly, one-handed logging: ≤30 seconds per attempt and ≤30 seconds per decision, tested separately.
Event history immutable.
Review dates derived from source review + interval rules; no hardcoded dates.
No task silently disappears from the daily plan.
No ordinary review after the last final unless explicitly opted into maintenance/carry-forward.
Daily budget enforced mechanically, not merely displayed.
Every scheduling decision auditable.
Current estimates and priorities never rewrite historical metric snapshots.
Performance target: maximum register 120 topics. Benchmark initial generation of up to 600 ordinary topic-level review events (2–3 tasks each) in <200 ms on target device. Retry generation must be incremental, not a full rebuild. Test with representative volume, assignments, incomplete events, and retries — not only the 84-topic planning estimate.
14. Acceptance tests (mandatory — a failing test blocks release or merge)
Allocation
H1 — Canonical allocation. The 90/120/10/mixed scenario produces exactly 90 + 70 + 10 + 10 = 180.
H2 — Review flood. High-priority queue partially serviced within capacity; assignment work allocated where possible; all remaining tasks receive dispositions.
H3 — Empty day. Mixed practice expands to target without inventing work.
H4 — Fuzz. At least 10,000 randomized scenarios all satisfy the daily budget.
H5 — Silent drop. Every considered task has exactly one disposition; no DO/DEFER overlap; no double-counted protected time.
Review state machine
I1 — Initial gate. Passing creates Review 1 at Day 0 + 1, with Sunday shifting handled.
I2 — Normal progression. Stage advancement uses the correct interval from the previous successful completion date.
I3 — Substantive Yellow. Creates a retry at the same stage; a successful retry advances exactly one stage.
I4 — Red and relearning. Red prevents normal progression; corrective work must be marked ready_to_retry before a retry is scheduled; a successful retry advances exactly once.
I5 — Post-finals. No ordinary review generated beyond last final; Stage 5 is terminal; every completed or unfinished topic is routed for classification.
Data integrity and metrics
J1 — Immutable estimate. Changing a current estimated duration does not alter historical duration-error metrics.
J2 — Intended-date integrity. Deferring a review never makes it count as on time.
J3 — Deferral denominator. One event deferred five times counts once in deferral rate and five times in total deferral decisions.
J4 — Event reconstruction. All eight metrics reproduce from immutable event log, including scheduled-event snapshots.
Work sessions
K1 — Partial assignment. A 120-minute assignment splits across sessions; each session logs without a G/Y/R result.
K2 — Corrective completion. A partial corrective session does not complete the corrective task; user must mark it ready_to_retry.
K3 — Assignment visibility. An assignment cannot disappear from the daily plan when its full remaining workload exceeds capacity.
Logging
L1 — Attempt logging. Requires result and actual duration; completable in ≤30 seconds on a phone.
L2 — Decision logging. DEFER and SKIP require no G/Y/R; SKIP requires reason + re-entry condition.
15. Four-week validation and change policy
Before the trial
Load actual courses, units, topics, lectures, assessments, and assignments. Verify every active topic has a learning objective and retrieval tasks. Run the full acceptance suite. Confirm daily budget is enforced under overload. Confirm exports and metrics work. Confirm seven key settings are editable. Measure logging time on a phone.
During the trial
Scheduling engine is frozen from Week 1 through the end of Week 4.
Only bugs that (a) make the trial infeasible, (b) corrupt data, (c) violate daily budget, or (d) prevent required measurement may be fixed. Every exception is logged with the bug, why the trial cannot continue without a fix, code/config change, date, and engine version.
Do not introduce new automation, scoring formula, dependency graph, or calibration algorithm during the trial.
At the end of Week 4
Measure
Target
Overall on-time completion
≥80%
Priority 1–3 on-time completion
≥80%
Deferral rate
≤20%
Median duration error (n ≥ 5)
≤25%
Overdue critical backlog
No increase for 2 consecutive weeks
Priority 1–3 skips
0
Priority 4–5 skip rate
≤15%
Tasks with required logging completed
≥90%
These are pilot targets, not universal constants. Also review task-preparation time, incomplete sessions, retry frequency, and missed-day recovery as supporting evidence.
Do not change the design because one difficult day produced poor results. Use four-week data to identify consistent failure patterns.
16. Phase 2 and Phase 3
Phase 2 — only after Week 4 evaluation
Manual median-of-last-five duration calibration, then automation only if useful.
PARK and RETIRE if SKIP + re-entry proves insufficient.
Performance-informed interval adjustments if observed results justify them.
Dependency propagation if prerequisite failures demonstrably cascade.
Automated priority scoring if tiered ranking + tie-breakers consistently fail.
Phase 3
Rolling semester-completion forecasts; post-finals lifecycle automation; cross-semester carry-forward.
17. Final implementation requirement
MVP succeeds only if Today answers:
What must I learn today?
What older material most needs my attention?
What can realistically fit into my available time?
What am I explicitly deferring or skipping, and why?
The app must remain honest about what has been completed, what remains unfinished, and what has been deliberately removed. It must not bypass the gate to clear backlog, exceed the daily budget to make the plan look complete, or silently postpone high-priority work.
Appendix A — As-built implementation assessment supplied with the reference (non-normative)
This appendix records the user's assessment of the built app at the time of the handoff. It is a historical implementation review, not a replacement for §§0–17 and not proof that these findings remain current after later commits.
Verdict: Strong product, but not yet the MVP we locked
The learning engine was assessed as genuinely well thought out: topic lifecycle, gate → review → corrective → retry pipeline, guided-practice runner, event history, and question snapshots were strong. Several details exceeded the spec, including per-attempt question snapshots, preserved selections across refresh, and pre-deletion recovery snapshots.
The MVP completeness bar, however, is the ability to produce eight metrics for a four-week evidence-based evaluation. At the time of assessment, the dashboard/metrics and settings gaps meant the app was not ready for the trial.
Strengths identified
Learning lifecycle matched the spec: initial learning → gate → five-stage review → corrective → retry → post-finals classification.
Gate behavior included three or more active gate questions, Green/Yellow/Red outcomes, critical-error flag, skill-demonstration alternative, threshold-based pass, and Day 0 based on actual pass date.
Intervals were anchored to actual completion dates; Sunday-to-Monday shift and post-finals guard were implemented.
Guided practice used attempt-from-memory → enter response → reveal criteria → self-assess. Prompt and expected criteria were snapshotted at attempt time.
Planned duration, timer, and recorded work session were separated; starting a timer was not treated as completion.
Mixed Practice and Saturday Sampler were distinct, with their own question purpose, selection rules, and unavailability logging.
Event log was comprehensive and append-only for learning events; versioned daily plans, work sessions, and task events existed.
Cloud persistence with revision checks and pre-deletion snapshots was viewed as a durability improvement, subject to network-responsiveness risk.
Defer limit, forced decisions, and SKIP with re-entry conditions were present.
Gaps and risks identified
Critical — no weekly analytics dashboard. The eight measures, targets, flags, sample counts and Week 4 export were not surfaced. Minimum acceptable fix: computed weekly metrics export in CSV and JSON, based on immutable intended_due_date, priority_at_scheduling, and duration snapshots.
Critical — Settings not fully editable. Required controls: daily_budget_min, review_reserve_min, repair_recovery_cap_min, gate_threshold_pct, defer_limit, intervals_days, and last_final_exam_date. Changes must be audited; the trial engine must be frozen after start.
Serious — logging speed unverified. Attempt and decision logging must each be tested separately on a phone and take no more than 30 seconds.
Serious — cloud round-trip/offline behavior unverified. Confirm attempt logging is not blocked by cloud latency and that offline/slow-network operation cannot lose an event. Document any network dependency honestly.
Usability — CSV curriculum management. CSV import is within scope, but one complete topic with four questions should be entered, validated, and imported in under 5 minutes; check template clarity, preview and row-level validation.
Routing concern. /study/manage was observed redirecting to the main Study page. Verify all trial-used screens are reachable and functional; fix only if it blocks the agreed workflow.
Acceptance evidence missing. Run and report H1–H5, I1–I5, J1–J4, K1–K3, L1–L2 before Week 1.
Snapshot integrity must be confirmed. Metrics must use immutable intended_due_date and priority_at_scheduling, never mutable due date/current priority.
Pre-trial priorities from that review
Blocking: ship the eight-metric calculation/export; expose the seven required settings; run the acceptance suite; measure attempt and defer logging on a phone; confirm offline/slow-network logging behavior; confirm immutable intended-date/priority snapshots and metric use.
Strongly recommended: time the complete topic + four-question CSV import (target <5 minutes); verify/fix /study/manage and all trial routes.
Track, do not expand scope: no auto-grading is not a defect; cloud persistence is acceptable only if logging is responsive and resilient.
Final assessment principle
The bar is not “does the app exist?” It is whether, on a difficult day, it produces a feasible plan, protects critical learning, declares what will not be done, records what actually happened, and produces evidence to prove it. Add the measurement and configuration capabilities before Week 1, then let four-week data — not speculation — determine Phase 2.
End of locked reference specification. Hand to developer. Run the acceptance suite. Measure logging time. Then start Week 1 and do not reopen this document until the Week 4 evaluation, except for documented blocking bug fixes under §15.