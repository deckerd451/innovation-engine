# Mobile UX contracts

This document records the behavior that the mobile redesign must preserve. It
is a contract for implementation and regression tests, not a product roadmap.

## Primary navigation

`#mobile-tab-bar` has exactly three primary destinations: Today
(`data-tab="home"`), Discover (`data-tab="discover"`), and You
(`data-tab="profile"`). Network, messages, and themes are compatibility or
secondary actions and must not become additional primary tabs.

## Today

Today applies `buildspace-view-today`, hides the graph, and renders the current
intent/right-now content. It may include messages, people, opportunities, and
work continuity. It must not create a second task store or mutate project
permissions.

## Discover

Discover applies the mobile dashboard panel and owns browsing. Its secondary
resource contract is People, Projects, Skills, Organizations, and
Opportunities. The internal Network mode is a People filter, not a separate
mobile destination.

## You

You opens the existing profile surface through `openProfileModal()`. The
redesign does not replace the profile modal in this phase.

## Project detail

`#project-detail-overlay` is a permissioned modal opened by `openNodePanel()` /
`viewProjectDetails()`. Existing tabs are Overview, Tasks, Capabilities,
People, and Activity. Tasks use `ProjectTasks` and capabilities use
`CapabilityMemory`; neither may be replaced by a parallel execution system.

On touch viewports the overlay is the single vertical scroll surface. The tab
row may scroll horizontally, and the measured mobile navigation height plus
safe-area inset must remain available below the final action.

## Capability journey events

The privacy-safe journey instrumentation emits only event names, coarse state,
and non-sensitive stable IDs (project/capability IDs are not included in the
default payload). It must never include goals, names, notes, costs, or free-form
member content.

Required events: `goal_entered`, `capability_viewed`, `capability_selected`,
`tasks_imported`, `outcome_recorded`. Events are dispatched as
`innovation-engine:capability-journey` and may be consumed by the existing
telemetry layer.

## Modal and desktop compatibility

Closing a project or profile modal must restore background scrolling. Desktop
workspace controls, graph navigation, project permissions, deep links, and
existing Supabase data contracts remain unchanged while mobile surfaces evolve.
