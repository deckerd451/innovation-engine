# Goal-to-outcome member test

This is the short moderated test for the human-centered refinement. It uses the existing Discover, project Work, project task, and outcome flows; it does not create test records outside the participant's chosen project.

## Run

Recruit 3–5 members with a real project or a permissioned demonstration project. Ask each person to use their own phone where possible. Do not ask them to share private goals or notes with the moderator.

1. In **Discover**, enter a goal in the member's own words.
2. Ask the member to choose one method and explain, in their own words, why it fits.
3. Ask them to choose an existing project and turn the method into tasks.
4. Ask them to open **Today**, continue the suggested task, and return to the project when needed.
5. After the work is complete, ask them to record whether the method helped, actual time, actual cost, and one short note.

## Record only these measures

- Could the member identify the next action without explanation?
- Where did they hesitate or scroll past the action?
- Did they understand “what you’ll need” and “what to watch for” without technical explanation?
- Did imported tasks appear once, in the existing project task list?
- Could they find the result form again from Today or the project?
- Did they understand that a reported result is their report, rather than independent verification?

Use the existing privacy-safe journey events (`goal_entered`, `capability_selected`, `tasks_imported`, and `outcome_recorded`) for aggregate completion counts. Do not record goal text, names, notes, or device identifiers in the test log.

## Pass criteria

- At least 4 of 5 members complete the journey without moderator intervention.
- At least 4 of 5 can state why they chose the method.
- No duplicate imported tasks are created.
- At least 4 of 5 can find and submit the outcome form.
- Any wording that requires moderator explanation is rewritten before the next round.

Real-member testing is not performed by automated tests. Record the date, participant count, aggregate event counts, and observed friction after the session.
