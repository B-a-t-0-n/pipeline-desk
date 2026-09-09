---
name: Pipeline Desk
description: A quiet Windows instrument for GitLab pipeline status.
colors:
  bg: "#141619"
  surface: "#1b1e22"
  raised: "#23272c"
  hover: "#2b3036"
  line: "#30353c"
  text: "#eef0f3"
  muted: "#9ba4af"
  faint: "#828d9a"
  blue: "#8cb4ff"
  blue-bg: "#23324a"
  green: "#79d7ab"
  green-bg: "#22392f"
  red: "#ff9196"
  red-bg: "#422b30"
  amber: "#e9c17b"
  accent: "#eaecf0"
  on-accent: "#1b1e22"
  light-bg: "#f5f6f8"
  light-surface: "#fff"
  light-raised: "#f0f2f5"
  light-hover: "#e6e9ee"
  light-line: "#dadee5"
  light-text: "#202731"
  light-muted: "#5c6674"
  light-faint: "#656f7d"
  light-blue: "#275eb8"
  light-blue-bg: "#e6edfc"
  light-green: "#20734e"
  light-green-bg: "#e5f4ec"
  light-red: "#b32d43"
  light-red-bg: "#fce8ec"
  light-amber: "#916019"
  light-accent: "#252d38"
  light-on-accent: "#fff"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  project-title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  status:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "14px"
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "12px"
  metadata:
    fontFamily: "Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "10px"
  code:
    fontFamily: "Consolas, Cascadia Mono, monospace"
    fontSize: "11px"
rounded:
  history: "2px"
  count: "6px"
  control: "7px"
  button: "8px"
  toast: "9px"
  card: "13px"
  dialog: "15px"
  node: "50%"
spacing:
  tight: "4px"
  inline: "8px"
  small: "12px"
  card-gap: "15px"
  compact-gutter: "16px"
  medium: "18px"
  comfortable: "20px"
  wide: "22px"
  large: "24px"
  dialog: "26px"
  overview-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.button}"
    padding: "8px 13px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "8px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    width: "32px"
    height: "32px"
  button-pin-selected:
    backgroundColor: "{colors.blue-bg}"
    textColor: "{colors.blue}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  filter:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
  filter-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
  pipeline-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  stage-node:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.node}"
    width: "19px"
    height: "19px"
  history-mark:
    rounded: "{rounded.history}"
    width: "7px"
    height: "13px"
---

# Design System: Pipeline Desk

## Overview

**Creative North Star: "A quiet Windows instrument"**

Pipeline Desk uses a graphite working surface, pale text and connected status nodes to make a pipeline readable at a glance. Segoe typography and restrained controls suit a small window that lives beside the user's work. The light theme preserves the same hierarchy and status meanings.

Density comes from compact measurements and short Russian labels. Project identity, current status and the stage path carry the visual weight; history and elapsed time remain subordinate. Motion communicates active work and immediate feedback.

**Key Characteristics:**

- Graphite and pale neutral surfaces with semantic status color.
- Segoe interface text, monospace identifiers and tabular measurements.
- Connected circular stages as the recurring signature.
- Compact controls and short, direct labels.
- Flat surfaces and purposeful motion that respects reduced-motion preferences.

Extracted from `ui/style.css`, `ui/index.html`, `ui/app.js` and native window configuration in `electron/main.cjs`. The direction contract in the first body comment is the qualitative source. Reviewed reference captures are `.impeccable/review/desktop.png`, `widget.png`, `mobile.png` and `light.png`.

## Colors

The neutral palette gives status colors clear separation without turning whole cards into alerts. Frontmatter values are the extracted primitives. Unprefixed keys represent the default dark theme; `light-` keys map to the same CSS variable under `data-theme="light"`.

### Primary

- **Action contrast — accent / on-accent:** the primary add or submit button uses contrasting neutral fill and text. This polarity reverses in the light theme.
- **Running blue — blue / blue-bg:** running pipelines, active stage strokes, pinned controls, focus rings and selection feedback. The light theme deepens the foreground blue for pale surfaces.

### Secondary

- **Completion green — green / green-bg:** successful pipeline labels, checked nodes, completed connections and connection indicators. The background primitive is available in both themes; current success indicators primarily use the foreground and mixed history marks.
- **Failure coral — red / red-bg:** failed pipeline labels, crossed nodes, field errors, connection errors and destructive text. Error banners and window-close hover use the paired background.
- **Waiting amber — amber:** manual work, warning states and the explicit demo indicator. It is a foreground signal without a dedicated filled badge.

### Neutral

- **Working surface — bg:** the page, standalone widget body and inset fields.
- **Panel surface — surface:** overview cards and dialogs; the widget's lower information bands.
- **Raised / hover:** selected filters, secondary actions, toasts and interactive hover feedback.
- **Line:** thin card outlines, stage links, row separators and footer boundaries.
- **Text / muted / faint:** primary content, supporting labels and compact tertiary metadata. Faint remains readable rather than functioning as hidden decoration.

**The Status Meaning Rule.** Blue means activity, green means completion, coral means failure and amber means manual attention or a warning. Pair the color with the existing symbol and status label.

Running and failed card outlines mix the relevant status color (30%) into the standard line. Completed stage connections mix green (50%) into the line. History success marks mix green (52%) into the surface, while failed history marks use red (80%); these are derived treatments, not additional primitive colors.

## Typography

**Interface font:** Segoe UI Variable Text, then Segoe UI, then sans-serif.

**Identifier font:** Consolas, then Cascadia Mono, then monospace. Branch names, short commit hashes and pipeline numbers use this stack; ordinary labels retain Segoe.

The type feels familiar in Windows and stays compact enough for a pinned monitor. The interface uses a practical size hierarchy rather than a display face or a mathematical type scale. Font synthesis is disabled.

- **Headline:** overview title; reduces to 22px at 700px and 21px at 460px.
- **Title:** dialog headings; widget dialog headings reduce to 15px.
- **Project title:** semibold project names. Standalone widgets use 14px, with the narrow-screen rule returning the card title to 13px below 460px.
- **Status:** the central reading anchor, with a circular symbol and a short label. List view uses 13px.
- **Body / label:** inherited base text and compact controls; buttons and field labels normally use the label size, and button labels are semibold.
- **Metadata / code:** namespaces and stages use compact Segoe labels; code identifiers use the monospace stack. Widget provenance and update footers may use 9px.

**The Stable Measurements Rule.** Counts and elapsed time use tabular numerals so updates keep their alignment. Numeric content changes without a counting animation.

Project names, namespaces and branches truncate on one line, with the full value supplied through the existing title or accessible label. Dialog headings and job names can wrap anywhere to preserve access to long identifiers.

## Layout

The overview has a native-style titlebar (48px), a centered content region (maximum 1440px), and a compact heading and toolbar above the project collection. Standard horizontal padding is 32px. Cards use an auto-filling grid with a 290px minimum column and a 15px gap. At 1280px and above, spacing opens to an 18px card gap, 42px top padding and more internal breathing room.

Each card reads from identity and pin control to status, branch and commit, then the connected stage path. A separated bottom strip pairs recent-run marks on the left with elapsed time on the right. Card content has 18px/19px top/side padding, increasing to 21px/22px on large screens. Card footers are at least 40px high, increasing to 44px on large screens.

List view uses a single column with a 9px gap and aligns identity, status, metadata and stages across each row. Below 1000px, it removes the metadata column. Below 700px, stages are hidden in list view and project/status remain. Card view continues to expose the stage sequence. Below 460px, gutters reduce to 16px, titlebar height to 43px and controls condense; the repeated toolbar refresh and heading settings icons are hidden while connection/settings access remains.

The standalone widget reuses the card's content order and fills its own window without an inner rounded border or overview titlebar. Its project heading is the drag handle, with overview, pin and close controls alongside. Content has 19px top and 21px side padding; a narrow history strip and 30px update footer sit below. Native widgets initially open at 388 × 280px, with a 330 × 230px minimum. The overview initially opens at 1100 × 790px, with a 660 × 500px minimum. Browser layout supports a 320px minimum independently of native window limits.

Dialogs fit the available viewport: normal width is at most 430px, detail width at most 510px, with a 16px horizontal margin and a maximum height of the small viewport height minus 40px. Widget dialogs reduce their internal padding to 18px.

## Elevation & Depth

Surfaces are flat: the implementation has no CSS box-shadow vocabulary. Tonal differences and thin borders establish grouping. A slightly darker mixed footer grounds each card. Running and failed outlines communicate state without a glow. Hover changes a border or surface color without lifting a card.

Dialogs use a black translucent backdrop (55%) with a 5px blur. Reduced-motion mode removes that blur. Toasts sit above content through fixed placement and stacking order, with a raised tonal surface and a thin outline.

## Shapes

Cards use softly rounded corners (13px), dialogs a slightly larger radius (15px), buttons 8px and compact controls/fields 7px. The count badge uses 6px, the toast 9px and the tiny history marks 2px. Standalone widget content is square within the native window. These measurements are component choices rather than one radius applied everywhere.

Status is drawn with circular outlined symbols (20px for the headline, 19px along a stage rail), joined by thin horizontal segments. Tiny status dots supplement filters and connection feedback. Icons are inline SVG with consistent strokes; they stay secondary to text and status nodes.

## Components

### Buttons and native controls

Primary and secondary buttons have a minimum height of 36px, compact padding and semibold labels. Primary hover dims the neutral fill slightly; secondary hover advances from raised to hover surface. Press feedback scales either to 0.97. Transparent icon buttons are 32px square in the overview, with smaller 27–28px variants inside cards and widgets. Icon-button presses scale to 0.91.

The selected pin uses the blue background and foreground pair, with `aria-pressed` reflecting its state. Overview controls minimize or hide the window to the tray. Widget controls return to the overview, toggle always-on-top and close that widget. The overview titlebar and widget project heading use native drag regions; actionable controls are excluded from dragging. Browser previews hide native titlebar controls and identify the Windows-only pin behavior when invoked.

Every keyboard-focusable control uses the shared 2px blue outline with a 3px offset. Disabled buttons become half opaque and display the waiting cursor.

### Filters and view navigation

Filters are short text buttons with counts, plus colored dots for activity and errors. Selection uses a raised surface and an outline, and `aria-pressed` carries the same state. The neighboring grid/list switch uses compact icon buttons divided from refresh by a vertical line. Counts use tabular numerals. View preference is retained locally.

### Inputs and dialogs

Fields use the working-surface color, a thin line border, compact 12px text and a minimum height of 40px. Focus adds a blue border in addition to the shared keyboard outline. Errors stay close to the form in coral text, using alert semantics. Native dialog behavior provides modal focus and Escape dismissal; a click outside the dialog rectangle also closes it.

### Pipeline cards and stage rail

The project title and pipeline number open details. Stage nodes also open the detailed stage/job list; the overview renders the first six stages and an additional-count control when needed. Stages retain their real names. Accessible labels and titles include each stage's name and status.

| State | Symbol and treatment |
| --- | --- |
| Running | Blue partial ring with a rotating stroke; the stage label is also blue. |
| Success | Green outlined circle with a check; completed connections carry green. |
| Failed | Coral outlined circle with a cross; the stage label is also coral. |
| Pending | Neutral dotted circle. |
| Manual | Amber outlined circle with a play symbol. |
| Warning | Amber outlined circle with an alert symbol. |
| Canceled / skipped | Neutral circle with a minus; skipped is visually subdued. |
| Created / unknown | Neutral empty circle; created is subdued. |

The play symbol communicates a GitLab manual state; this monitor does not execute jobs. Missing pipelines and missing jobs receive short inline messages. Fetch failures retain the available context and indicate the age of cached data. Samples are explicitly marked as demo in the overview, widget and detail view.

### History and elapsed time

Recent runs appear as small vertical marks ordered from older on the left to newer on the right. Their accessible labels expose the pipeline ID and status; hover stretches the mark vertically to 1.35 and brightens it. Elapsed time updates once per second with stable numerals. Live history links lead to the corresponding GitLab run.

### Motion and feedback

The easing used for purposeful transitions is `cubic-bezier(.16,1,.3,1)`. Most controls transition over 180–220ms. Running rings rotate continuously over 1.4 seconds; the refresh icon rotates over one second only while refreshing. This traveling stroke is the system's signature activity cue.

Dialogs enter with a short opacity/position/scale transition over 220ms. Toasts fade over 200ms, settle vertically over 250ms and dismiss after 3.6 seconds. Theme changes use a browser view transition when supported, and the selected theme propagates between windows through local storage.

**The Motion Has Meaning Rule.** Animate activity, direct interaction and transient feedback. Keep completed pipeline content steady.

Under `prefers-reduced-motion: reduce`, CSS animations and transitions stop, scrolling remains immediate and running rings become static dashed circles. JavaScript also bypasses the theme view transition. Status remains readable through the label and static symbol.

## Do's and Don'ts

### Do:

- **Do** reuse the semantic theme variables so both dark and light surfaces preserve status meaning.
- **Do** keep project identity, current status and stage sequence as the main reading order.
- **Do** pair status color with a symbol and a short label or accessible name.
- **Do** use tabular numerals for changing measurements and monospace only for identifiers.
- **Do** retain native drag regions, explicit pin state and keyboard focus feedback.
- **Do** keep demo and stale-data indicators visible and concise.
- **Do** preserve a static, understandable running state when reduced motion is requested.

### Don'ts:

- **Don't** add explanatory dashboard chrome or long copy to the compact monitoring surface.
- **Don't** use decorative glows, shadow stacks or card-lift animations in the flat visual system.
- **Don't** substitute status colors for text and symbol cues.
- **Don't** animate completed states or count changing durations with rolling digits.
- **Don't** turn monitoring controls into run, retry, cancel or deploy actions.
- **Don't** make interactive window controls part of a drag region.

### Connection and project selection

On first connection, the dialog exposes an empty server URL field and a token input, with focus on the server. After a server is saved, a compact server row retains identity and an explicit change action; polling settings live in native details. The token creation link carries the app name and read_api scope to the entered GitLab server. A configured .netrc can be used without entering its path; a rejected credential gets a concise inline explanation and an explicit retry.

The project dialog opens with a searchable list of native checkboxes. Names and namespaces identify each project; a pale blue selected surface and a check communicate selection together. Selection survives searches and pagination, and the action shows the selected count. A secondary mode retains project links and optional branches. Both dialogs reuse the existing theme, focus outlines and reduced-motion behavior.

### Compact monitoring and groups

Compact rows stretch across the available width and align status symbol, project identity, pipeline number and repository action in a single 38px row without a branch subtitle. Narrow windows keep the status symbol and its accessible label while hiding the redundant status word. Symbols retain the established semantic colors.

A horizontal group selector precedes the pipeline filters; the current group's name, edit action and pin action sit together below it. A group widget uses one draggable 42px header and a scrollable list of repositories, with a 24px sync footer. Its initial height fits its contents up to a bounded maximum. A native select offers row, stages and detailed views, preserving each widget's view and height per mode. New group widgets default to stages: a compact identity row above every stage node and its full label, wrapping after four columns. Detailed widgets also show every stage. Individual compact widgets reduce to a draggable identity row and one status row. The view picker stays mounted during pipeline refreshes; window controls always remain outside drag regions.

Group composition reuses the native-checkbox picker with three source modes: individual projects, GitLab groups and local groups. Paths distinguish similarly named groups and subgroups. The optional name and default inclusion of subgroups keep setup short.
